"""
================================================================================
                    QUANT X BROKER INTEGRATION
                    ===========================
                    
    Supports: Zerodha, Angel One, Upstox
================================================================================
"""

import os
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional
from enum import Enum

import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"
    SL_M = "SL-M"

class TransactionType(Enum):
    BUY = "BUY"
    SELL = "SELL"

class ProductType(Enum):
    CNC = "CNC"
    MIS = "MIS"
    NRML = "NRML"

class OrderStatus(Enum):
    PENDING = "PENDING"
    OPEN = "OPEN"
    COMPLETE = "COMPLETE"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"

@dataclass
class Order:
    symbol: str
    exchange: str
    transaction_type: TransactionType
    quantity: int
    product: ProductType
    order_type: OrderType
    price: float = 0
    trigger_price: float = 0
    instrument_token: Optional[str] = None
    order_id: str = None
    status: OrderStatus = None
    filled_quantity: int = 0
    average_price: float = 0
    message: str = ""

@dataclass
class Position:
    symbol: str
    exchange: str
    quantity: int
    average_price: float
    current_price: float
    pnl: float
    pnl_percent: float
    product: ProductType

@dataclass
class GTTOrder:
    symbol: str
    exchange: str
    trigger_type: str
    trigger_values: List[float]
    orders: List[Dict]
    gtt_id: str = None
    status: str = None

class BaseBroker(ABC):
    def __init__(self, credentials: Dict):
        self.credentials = credentials
        self.access_token = None
        self.is_authenticated = False
        self.name = "BaseBroker"

    @abstractmethod
    def login(self) -> bool: pass

    @abstractmethod
    def place_order(self, order: Order) -> Order: pass

    @abstractmethod
    def cancel_order(self, order_id: str) -> bool: pass

    @abstractmethod
    def get_order_status(self, order_id: str) -> OrderStatus: pass

    @abstractmethod
    def get_positions(self) -> List[Position]: pass

    @abstractmethod
    def get_holdings(self) -> List[Dict]: pass

    @abstractmethod
    def get_quote(self, symbol: str, exchange: str) -> Dict: pass

    @abstractmethod
    def place_gtt_order(self, gtt: GTTOrder) -> GTTOrder: pass

    @abstractmethod
    def get_available_margin(self) -> float: pass

    def get_option_chain(self, symbol: str, expiry: str = "") -> List[Dict]:
        """
        Fetch live options chain from broker API.
        Returns list of dicts with keys: strike, option_type ('CE'/'PE'),
        ltp, bid, ask, oi, oi_change, volume, iv, delta, gamma, theta, vega.
        Override in subclass for broker-specific implementation.
        """
        return []

class ZerodhaBroker(BaseBroker):
    def __init__(self, credentials: Dict):
        super().__init__(credentials)
        self.name = "Zerodha"
        self.kite = None
        self._enctoken = None  # Direct API mode (no KiteConnect library)
        self._session = None

    def login(self) -> bool:
        try:
            # Mode 1: enctoken (direct OMS API — no KiteConnect library needed)
            if 'enctoken' in self.credentials:
                import requests as _requests
                self._enctoken = self.credentials['enctoken']
                self._session = _requests.Session()
                self._session.headers.update({
                    "Authorization": f"enctoken {self._enctoken}",
                    "X-Kite-Version": "3",
                })
                # Verify token is valid
                resp = self._session.get(
                    "https://kite.zerodha.com/oms/user/profile", timeout=10
                )
                if resp.status_code == 200:
                    self.is_authenticated = True
                    logger.info("Zerodha enctoken auth OK")
                    return True
                logger.warning(f"Zerodha enctoken auth failed: {resp.status_code}")
                return False

            # Mode 2: KiteConnect access_token (standard OAuth)
            from kiteconnect import KiteConnect
            self.kite = KiteConnect(api_key=self.credentials['api_key'])
            if 'access_token' in self.credentials:
                self.kite.set_access_token(self.credentials['access_token'])
                self.is_authenticated = True
                return True
            return False
        except Exception as e:
            logger.error(f"Zerodha login error: {e}")
            return False

    def _oms_post(self, path: str, data: Dict) -> Dict:
        """Direct OMS API call using enctoken."""
        resp = self._session.post(
            f"https://kite.zerodha.com/oms{path}", data=data, timeout=15
        )
        return resp.json()

    def _oms_get(self, path: str, params: Dict = None) -> Dict:
        """Direct OMS API GET using enctoken."""
        resp = self._session.get(
            f"https://kite.zerodha.com/oms{path}", params=params, timeout=15
        )
        return resp.json()

    def _oms_delete(self, path: str) -> Dict:
        """Direct OMS API DELETE using enctoken."""
        resp = self._session.delete(
            f"https://kite.zerodha.com/oms{path}", timeout=15
        )
        return resp.json()

    def place_order(self, order: Order) -> Order:
        if not self.is_authenticated:
            order.status = OrderStatus.REJECTED
            order.message = "Not authenticated"
            return order

        order_data = {
            "tradingsymbol": order.symbol,
            "exchange": order.exchange,
            "transaction_type": order.transaction_type.value,
            "quantity": order.quantity,
            "product": order.product.value,
            "order_type": order.order_type.value,
        }
        if order.order_type == OrderType.LIMIT:
            order_data["price"] = order.price
        if order.order_type in [OrderType.SL, OrderType.SL_M]:
            order_data["trigger_price"] = order.trigger_price
        order_data["validity"] = "DAY"

        try:
            # Enctoken direct API
            if self._enctoken:
                result = self._oms_post("/orders/regular", order_data)
                if result.get("status") == "success":
                    order.order_id = str(result["data"]["order_id"])
                    order.status = OrderStatus.PENDING
                else:
                    order.status = OrderStatus.REJECTED
                    order.message = result.get("message", "Unknown error")
                return order

            # KiteConnect library
            order_id = self.kite.place_order(
                variety="regular",
                tradingsymbol=order.symbol,
                exchange=order.exchange,
                transaction_type=order.transaction_type.value,
                quantity=order.quantity,
                product=order.product.value,
                order_type=order.order_type.value,
                price=order.price if order.order_type == OrderType.LIMIT else None,
                trigger_price=order.trigger_price if order.order_type in [OrderType.SL, OrderType.SL_M] else None
            )
            order.order_id = str(order_id)
            order.status = OrderStatus.PENDING
            return order
        except Exception as e:
            order.status = OrderStatus.REJECTED
            order.message = str(e)
            return order
    
    def cancel_order(self, order_id: str) -> bool:
        try:
            if self._enctoken:
                result = self._oms_delete(f"/orders/regular/{order_id}")
                return result.get("status") == "success"
            self.kite.cancel_order(variety="regular", order_id=order_id)
            return True
        except:
            return False

    def get_order_status(self, order_id: str) -> OrderStatus:
        try:
            if self._enctoken:
                result = self._oms_get("/orders")
                for o in result.get("data", []):
                    if str(o['order_id']) == order_id:
                        return OrderStatus[o['status'].upper()]
                return OrderStatus.PENDING
            for o in self.kite.orders():
                if str(o['order_id']) == order_id:
                    return OrderStatus[o['status'].upper()]
            return OrderStatus.PENDING
        except:
            return OrderStatus.PENDING

    def get_positions(self) -> List[Position]:
        positions = []
        try:
            if self._enctoken:
                result = self._oms_get("/portfolio/positions")
                net = result.get("data", {}).get("net", [])
            else:
                net = self.kite.positions().get('net', [])
            for p in net:
                if p['quantity'] != 0:
                    positions.append(Position(
                        symbol=p['tradingsymbol'],
                        exchange=p['exchange'],
                        quantity=p['quantity'],
                        average_price=p['average_price'],
                        current_price=p['last_price'],
                        pnl=p['pnl'],
                        pnl_percent=(p['pnl'] / (p['average_price'] * abs(p['quantity']))) * 100 if p['average_price'] > 0 else 0,
                        product=ProductType.CNC
                    ))
        except Exception as e:
            logger.error(f"Positions error: {e}")
        return positions

    def get_holdings(self) -> List[Dict]:
        try:
            if self._enctoken:
                result = self._oms_get("/portfolio/holdings")
                return result.get("data", [])
            return self.kite.holdings()
        except:
            return []

    def get_quote(self, symbol: str, exchange: str) -> Dict:
        try:
            if self._enctoken:
                result = self._oms_get("/quote", {"i": f"{exchange}:{symbol}"})
                return result.get("data", {}).get(f"{exchange}:{symbol}", {})
            return self.kite.quote([f"{exchange}:{symbol}"]).get(f"{exchange}:{symbol}", {})
        except:
            return {}

    def place_gtt_order(self, gtt: GTTOrder) -> GTTOrder:
        try:
            if self._enctoken:
                # GTT not supported via enctoken — skip gracefully
                gtt.status = "skipped"
                logger.info("GTT skipped — not supported in enctoken mode")
                return gtt
            gtt_id = self.kite.place_gtt(
                trigger_type=self.kite.GTT_TYPE_OCO if gtt.trigger_type == "two-leg" else self.kite.GTT_TYPE_SINGLE,
                tradingsymbol=gtt.symbol,
                exchange=gtt.exchange,
                trigger_values=gtt.trigger_values,
                last_price=gtt.orders[0].get('last_price', gtt.trigger_values[0]),
                orders=gtt.orders
            )
            gtt.gtt_id = str(gtt_id)
            gtt.status = "active"
        except Exception as e:
            gtt.status = "failed"
            logger.error(f"GTT error: {e}")
        return gtt

    def get_available_margin(self) -> float:
        try:
            if self._enctoken:
                result = self._oms_get("/user/margins")
                return result.get("data", {}).get("equity", {}).get("available", {}).get("live_balance", 0)
            return self.kite.margins().get('equity', {}).get('available', {}).get('live_balance', 0)
        except:
            return 0

    def get_option_chain(self, symbol: str, expiry: str = "") -> List[Dict]:
        """Fetch options chain via Kite Connect instruments + quote API."""
        if not self.is_authenticated or not self.kite:
            return []
        try:
            # Build instrument keys for NFO segment
            instruments = self.kite.instruments("NFO")
            filtered = [
                i for i in instruments
                if i['name'] == symbol
                and i['instrument_type'] in ('CE', 'PE')
                and (not expiry or str(i['expiry']) == expiry)
            ]
            if not filtered:
                return []

            # Pick nearest expiry if not specified
            if not expiry:
                expiries = sorted(set(i['expiry'] for i in filtered))
                nearest = expiries[0] if expiries else None
                if not nearest:
                    return []
                filtered = [i for i in filtered if i['expiry'] == nearest]

            # Fetch quotes in batches of 200 (Kite limit)
            chain = []
            batch_size = 200
            for i in range(0, len(filtered), batch_size):
                batch = filtered[i:i + batch_size]
                keys = [f"NFO:{inst['tradingsymbol']}" for inst in batch]
                quotes = self.kite.quote(keys)

                for inst in batch:
                    key = f"NFO:{inst['tradingsymbol']}"
                    q = quotes.get(key, {})
                    ohlc = q.get('ohlc', {})
                    chain.append({
                        'strike': float(inst['strike']),
                        'option_type': inst['instrument_type'],  # 'CE' or 'PE'
                        'expiry': str(inst['expiry']),
                        'ltp': q.get('last_price', 0),
                        'bid': q.get('depth', {}).get('buy', [{}])[0].get('price', 0),
                        'ask': q.get('depth', {}).get('sell', [{}])[0].get('price', 0),
                        'oi': q.get('oi', 0),
                        'oi_change': q.get('oi_day_high', 0) - q.get('oi_day_low', 0),
                        'volume': q.get('volume', 0),
                        'iv': 0,  # Kite doesn't return IV directly; computed downstream
                        'lot_size': inst.get('lot_size', 1),
                        'tradingsymbol': inst['tradingsymbol'],
                    })
            return chain
        except Exception as e:
            logger.error(f"Zerodha option chain error for {symbol}: {e}")
            return []

class AngelOneBroker(BaseBroker):
    def __init__(self, credentials: Dict):
        super().__init__(credentials)
        self.name = "AngelOne"
        self.smart_api = None
        self._refresh_token = None

    def login(self) -> bool:
        try:
            from SmartApi import SmartConnect
            import pyotp
            self.smart_api = SmartConnect(api_key=self.credentials['api_key'])
            totp = pyotp.TOTP(self.credentials['totp_secret']).now()
            data = self.smart_api.generateSession(
                clientCode=self.credentials['client_id'],
                password=self.credentials['password'],
                totp=totp
            )
            if data['status']:
                self.access_token = data['data']['jwtToken']
                self._refresh_token = data['data'].get('refreshToken')
                self.is_authenticated = True
                return True
            return False
        except Exception as e:
            logger.error(f"AngelOne login error: {e}")
            return False

    def refresh_session(self) -> bool:
        """Refresh expired session using refresh token."""
        try:
            if not self._refresh_token:
                return self.login()
            data = self.smart_api.generateToken(self._refresh_token)
            if data['status']:
                self.access_token = data['data']['jwtToken']
                self._refresh_token = data['data'].get('refreshToken', self._refresh_token)
                self.is_authenticated = True
                return True
            return self.login()
        except Exception:
            return self.login()
    
    def place_order(self, order: Order) -> Order:
        if not self.is_authenticated:
            order.status = OrderStatus.REJECTED
            return order
        try:
            response = self.smart_api.placeOrder({
                "variety": "NORMAL",
                "tradingsymbol": order.symbol,
                "transactiontype": order.transaction_type.value,
                "exchange": order.exchange,
                "ordertype": order.order_type.value,
                "producttype": "DELIVERY" if order.product == ProductType.CNC else "INTRADAY",
                "duration": "DAY",
                "quantity": str(order.quantity),
                "price": str(order.price) if order.order_type == OrderType.LIMIT else "0"
            })
            if response['status']:
                order.order_id = response['data']['orderid']
                order.status = OrderStatus.PENDING
            else:
                order.status = OrderStatus.REJECTED
                order.message = response['message']
        except Exception as e:
            order.status = OrderStatus.REJECTED
            order.message = str(e)
        return order
    
    def cancel_order(self, order_id: str) -> bool:
        try:
            return self.smart_api.cancelOrder(order_id, "NORMAL")['status']
        except:
            return False
    
    def get_order_status(self, order_id: str) -> OrderStatus:
        try:
            for o in self.smart_api.orderBook()['data']:
                if o['orderid'] == order_id:
                    return OrderStatus[o['orderstatus'].upper()]
            return OrderStatus.PENDING
        except:
            return OrderStatus.PENDING
    
    def get_positions(self) -> List[Position]:
        positions = []
        try:
            response = self.smart_api.position()
            if response['status']:
                for p in response['data']:
                    if int(p['netqty']) != 0:
                        positions.append(Position(
                            symbol=p['tradingsymbol'],
                            exchange=p['exchange'],
                            quantity=int(p['netqty']),
                            average_price=float(p['averageprice']),
                            current_price=float(p['ltp']),
                            pnl=float(p['pnl']),
                            pnl_percent=0,
                            product=ProductType.CNC
                        ))
        except Exception as e:
            logger.error(f"Positions error: {e}")
        return positions
    
    def get_holdings(self) -> List[Dict]:
        try:
            r = self.smart_api.holding()
            return r['data'] if r['status'] else []
        except:
            return []
    
    def get_quote(self, symbol: str, exchange: str) -> Dict:
        try:
            r = self.smart_api.ltpData(exchange, symbol, "")
            return r['data'] if r['status'] else {}
        except:
            return {}
    
    def place_gtt_order(self, gtt: GTTOrder) -> GTTOrder:
        """
        Angel One doesn't support native GTT via SDK.
        Alternative: Place SL-M order for stop loss protection.
        Target is managed by the position monitor (scheduler).
        """
        if not self.is_authenticated or not gtt.trigger_values:
            gtt.status = "failed"
            return gtt
        try:
            sl_price = gtt.trigger_values[0]
            sell_order = gtt.orders[0] if gtt.orders else {}
            qty = sell_order.get('quantity', 0)
            if qty <= 0:
                gtt.status = "failed"
                return gtt
            response = self.smart_api.placeOrder({
                "variety": "STOPLOSS",
                "tradingsymbol": gtt.symbol,
                "transactiontype": sell_order.get('transaction_type', 'SELL'),
                "exchange": gtt.exchange,
                "ordertype": "STOPLOSS_MARKET",
                "producttype": "DELIVERY",
                "duration": "DAY",
                "quantity": str(qty),
                "triggerprice": str(sl_price),
                "price": "0",
            })
            if response.get('status'):
                gtt.gtt_id = response['data'].get('orderid', '')
                gtt.status = "sl_placed"
                logger.info(f"AngelOne SL-M order placed for {gtt.symbol} at {sl_price}")
            else:
                gtt.status = "sl_failed"
                logger.warning(f"AngelOne SL-M failed: {response.get('message', '')}")
        except Exception as e:
            gtt.status = "sl_failed"
            logger.error(f"AngelOne GTT alternative error: {e}")
        return gtt

    def get_available_margin(self) -> float:
        try:
            r = self.smart_api.rmsLimit()
            return float(r['data']['availablecash']) if r['status'] else 0
        except:
            return 0

    def get_option_chain(self, symbol: str, expiry: str = "") -> List[Dict]:
        """Fetch options chain via Angel One SmartAPI."""
        if not self.is_authenticated or not self.smart_api:
            return []
        try:
            # Angel One option chain endpoint
            params = {"symbol": symbol, "expirydate": expiry} if expiry else {"symbol": symbol}
            r = self.smart_api.optionGreek(params)
            if not r or not r.get('status') or not r.get('data'):
                return []

            chain = []
            for item in r['data']:
                chain.append({
                    'strike': float(item.get('strikeprice', 0)),
                    'option_type': item.get('optiontype', ''),  # 'CE' or 'PE'
                    'expiry': item.get('expirydate', expiry),
                    'ltp': float(item.get('ltp', 0)),
                    'bid': float(item.get('bidprice', 0)),
                    'ask': float(item.get('askprice', 0)),
                    'oi': int(item.get('opninterest', 0)),
                    'oi_change': int(item.get('changeinopeninterest', 0)),
                    'volume': int(item.get('volume', 0)),
                    'iv': float(item.get('impliedvolatility', 0)),
                    'delta': float(item.get('delta', 0)),
                    'gamma': float(item.get('gamma', 0)),
                    'theta': float(item.get('theta', 0)),
                    'vega': float(item.get('vega', 0)),
                    'lot_size': int(item.get('lotsize', 1)),
                    'tradingsymbol': item.get('tradingsymbol', ''),
                })
            return chain
        except Exception as e:
            logger.error(f"AngelOne option chain error for {symbol}: {e}")
            return []

class UpstoxBroker(BaseBroker):
    def __init__(self, credentials: Dict):
        super().__init__(credentials)
        self.name = "Upstox"
        self.base_url = "https://api.upstox.com/v2"
        self.headers = {}

    def login(self) -> bool:
        if 'access_token' in self.credentials:
            self.access_token = self.credentials['access_token']
            self.headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            self.is_authenticated = True
            return True
        return False

    def refresh_session(self) -> bool:
        """Refresh expired Upstox access token using refresh flow."""
        try:
            api_key = self.credentials.get('api_key', '')
            api_secret = self.credentials.get('api_secret', '')
            refresh_token = self.credentials.get('refresh_token', '')
            if not all([api_key, api_secret, refresh_token]):
                return False
            r = httpx.post(
                f"{self.base_url}/login/authorization/token",
                data={
                    'apiKey': api_key,
                    'apiSecret': api_secret,
                    'refreshToken': refresh_token,
                    'grant_type': 'refresh_token',
                },
                timeout=15,
            )
            data = r.json()
            if data.get('status') == 'success':
                self.credentials['access_token'] = data['data']['access_token']
                return self.login()
            return False
        except Exception:
            return False

    def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict:
        url = f"{self.base_url}{endpoint}"
        try:
            if method == "GET":
                r = httpx.get(url, headers=self.headers, params=data, timeout=15)
            elif method == "DELETE":
                r = httpx.delete(url, headers=self.headers, params=data, timeout=15)
            else:
                r = httpx.post(url, headers=self.headers, json=data, timeout=15)
            return r.json()
        except Exception:
            return {'status': 'error'}
    
    def place_order(self, order: Order) -> Order:
        if not self.is_authenticated:
            order.status = OrderStatus.REJECTED
            return order
        try:
            instrument_token = order.instrument_token
            if not instrument_token:
                if order.exchange == "NFO":
                    instrument_token = f"NSE_FO|{order.symbol}"
                else:
                    instrument_token = f"NSE_EQ|{order.symbol}"
            r = self._request("POST", "/order/place", {
                "quantity": order.quantity,
                "product": "D" if order.product == ProductType.CNC else "I",
                "validity": "DAY",
                "price": order.price,
                "instrument_token": instrument_token,
                "order_type": order.order_type.value,
                "transaction_type": order.transaction_type.value
            })
            if r.get('status') == 'success':
                order.order_id = r['data']['order_id']
                order.status = OrderStatus.PENDING
            else:
                order.status = OrderStatus.REJECTED
        except Exception as e:
            order.status = OrderStatus.REJECTED
            order.message = str(e)
        return order
    
    def cancel_order(self, order_id: str) -> bool:
        r = self._request("DELETE", f"/order/cancel?order_id={order_id}")
        return r.get('status') == 'success'
    
    def get_order_status(self, order_id: str) -> OrderStatus:
        r = self._request("GET", f"/order/details?order_id={order_id}")
        if r.get('status') == 'success':
            return OrderStatus[r['data']['status'].upper()]
        return OrderStatus.PENDING
    
    def get_positions(self) -> List[Position]:
        positions = []
        r = self._request("GET", "/portfolio/short-term-positions")
        if r.get('status') == 'success':
            for p in r.get('data', []):
                if p['quantity'] != 0:
                    positions.append(Position(
                        symbol=p['trading_symbol'],
                        exchange=p['exchange'],
                        quantity=p['quantity'],
                        average_price=p['average_price'],
                        current_price=p['last_price'],
                        pnl=p['pnl'],
                        pnl_percent=0,
                        product=ProductType.CNC
                    ))
        return positions
    
    def get_holdings(self) -> List[Dict]:
        r = self._request("GET", "/portfolio/long-term-holdings")
        return r.get('data', []) if r.get('status') == 'success' else []
    
    def get_quote(self, symbol: str, exchange: str) -> Dict:
        r = self._request("GET", f"/market-quote/ltp?instrument_key=NSE_EQ|{symbol}")
        return r.get('data', {}) if r.get('status') == 'success' else {}
    
    def place_gtt_order(self, gtt: GTTOrder) -> GTTOrder:
        """
        Upstox doesn't support native GTT via API.
        Alternative: Place SL-M order for stop loss protection.
        Target is managed by the position monitor (scheduler).
        """
        if not self.is_authenticated or not gtt.trigger_values:
            gtt.status = "failed"
            return gtt
        try:
            sl_price = gtt.trigger_values[0]
            sell_order = gtt.orders[0] if gtt.orders else {}
            qty = sell_order.get('quantity', 0)
            if qty <= 0:
                gtt.status = "failed"
                return gtt
            instrument_token = f"NSE_EQ|{gtt.symbol}"
            r = self._request("POST", "/order/place", {
                "quantity": qty,
                "product": "D",
                "validity": "DAY",
                "price": 0,
                "trigger_price": sl_price,
                "instrument_token": instrument_token,
                "order_type": "SL-M",
                "transaction_type": sell_order.get('transaction_type', 'SELL'),
            })
            if r.get('status') == 'success':
                gtt.gtt_id = r['data'].get('order_id', '')
                gtt.status = "sl_placed"
                logger.info(f"Upstox SL-M order placed for {gtt.symbol} at {sl_price}")
            else:
                gtt.status = "sl_failed"
                logger.warning(f"Upstox SL-M failed: {r}")
        except Exception as e:
            gtt.status = "sl_failed"
            logger.error(f"Upstox GTT alternative error: {e}")
        return gtt

    def get_available_margin(self) -> float:
        r = self._request("GET", "/user/get-funds-and-margin")
        if r.get('status') == 'success':
            return float(r['data'].get('equity', {}).get('available_margin', 0))
        return 0

    def get_option_chain(self, symbol: str, expiry: str = "") -> List[Dict]:
        """Fetch options chain via Upstox v2 API."""
        if not self.is_authenticated:
            return []
        try:
            params = {"instrument_key": f"NSE_INDEX|{symbol}"}
            if expiry:
                params["expiry_date"] = expiry
            r = self._request("GET", "/option/chain", params)
            if r.get('status') != 'success' or not r.get('data'):
                return []

            chain = []
            for item in r['data']:
                for side in ('call_options', 'put_options'):
                    opt = item.get(side, {})
                    mkt = opt.get('market_data', {})
                    greeks = opt.get('option_greeks', {})
                    if not mkt:
                        continue
                    chain.append({
                        'strike': float(item.get('strike_price', 0)),
                        'option_type': 'CE' if side == 'call_options' else 'PE',
                        'expiry': item.get('expiry', expiry),
                        'ltp': float(mkt.get('ltp', 0)),
                        'bid': float(mkt.get('bid_price', 0)),
                        'ask': float(mkt.get('ask_price', 0)),
                        'oi': int(mkt.get('oi', 0)),
                        'oi_change': int(mkt.get('oi_day_change', 0)),
                        'volume': int(mkt.get('volume', 0)),
                        'iv': float(greeks.get('iv', 0)),
                        'delta': float(greeks.get('delta', 0)),
                        'gamma': float(greeks.get('gamma', 0)),
                        'theta': float(greeks.get('theta', 0)),
                        'vega': float(greeks.get('vega', 0)),
                    })
            return chain
        except Exception as e:
            logger.error(f"Upstox option chain error for {symbol}: {e}")
            return []

class BrokerFactory:
    @staticmethod
    def create(broker_name: str, credentials: Dict) -> BaseBroker:
        brokers = {
            'zerodha': ZerodhaBroker,
            'angelone': AngelOneBroker,
            'upstox': UpstoxBroker
        }
        if broker_name.lower() not in brokers:
            raise ValueError(f"Unknown broker: {broker_name}")
        return brokers[broker_name.lower()](credentials)

class TradeExecutor:
    def __init__(self, broker: BaseBroker):
        self.broker = broker
    
    def execute_signal(
        self,
        symbol: str,
        direction: str,
        confidence: float,
        entry_price: float,
        stop_loss: float,
        target: float,
        capital: float,
        risk_percent: float = 3.0
    ) -> Dict:
        result = {'success': False, 'symbol': symbol, 'direction': direction}
        
        if confidence < 70:
            result['message'] = f"Confidence {confidence}% below 70%"
            return result
        
        risk_amount = capital * (risk_percent / 100)
        risk_per_share = abs(entry_price - stop_loss)
        
        if risk_per_share <= 0:
            result['message'] = "Invalid stop loss"
            return result
        
        quantity = int(risk_amount / risk_per_share)
        if quantity < 1:
            result['message'] = "Position size too small"
            return result
        
        margin = self.broker.get_available_margin()
        if quantity * entry_price > margin:
            quantity = int(margin / entry_price)
            if quantity < 1:
                result['message'] = "Insufficient margin"
                return result
        
        order = Order(
            symbol=symbol,
            exchange="NSE",
            transaction_type=TransactionType.BUY if direction == 'LONG' else TransactionType.SELL,
            quantity=quantity,
            product=ProductType.CNC if direction == 'LONG' else ProductType.NRML,
            order_type=OrderType.LIMIT,
            price=entry_price
        )
        
        order = self.broker.place_order(order)
        
        if order.status == OrderStatus.REJECTED:
            result['message'] = f"Order rejected: {order.message}"
            return result
        
        gtt = GTTOrder(
            symbol=symbol,
            exchange="NSE",
            trigger_type="two-leg",
            trigger_values=[stop_loss, target],
            orders=[
                {'transaction_type': 'SELL' if direction == 'LONG' else 'BUY', 'quantity': quantity, 'price': stop_loss},
                {'transaction_type': 'SELL' if direction == 'LONG' else 'BUY', 'quantity': quantity, 'price': target}
            ]
        )
        gtt = self.broker.place_gtt_order(gtt)

        result['success'] = True
        result['order_id'] = order.order_id
        result['gtt_id'] = gtt.gtt_id
        result['gtt_status'] = gtt.status
        result['quantity'] = quantity

        if gtt.status == "active":
            result['message'] = "Trade executed with GTT (SL + Target)"
        elif gtt.status == "sl_placed":
            result['message'] = "Trade executed with SL order (target managed by position monitor)"
        else:
            result['message'] = "Trade executed (SL/target managed by position monitor)"

        return result

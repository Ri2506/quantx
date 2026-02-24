"""
================================================================================
                    SWINGAI BROKER INTEGRATION
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

class ZerodhaBroker(BaseBroker):
    def __init__(self, credentials: Dict):
        super().__init__(credentials)
        self.name = "Zerodha"
        self.kite = None
    
    def login(self) -> bool:
        try:
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
    
    def place_order(self, order: Order) -> Order:
        if not self.is_authenticated:
            order.status = OrderStatus.REJECTED
            order.message = "Not authenticated"
            return order
        try:
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
            self.kite.cancel_order(variety="regular", order_id=order_id)
            return True
        except:
            return False
    
    def get_order_status(self, order_id: str) -> OrderStatus:
        try:
            for o in self.kite.orders():
                if str(o['order_id']) == order_id:
                    return OrderStatus[o['status'].upper()]
            return OrderStatus.PENDING
        except:
            return OrderStatus.PENDING
    
    def get_positions(self) -> List[Position]:
        positions = []
        try:
            for p in self.kite.positions().get('net', []):
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
            return self.kite.holdings()
        except:
            return []
    
    def get_quote(self, symbol: str, exchange: str) -> Dict:
        try:
            return self.kite.quote([f"{exchange}:{symbol}"]).get(f"{exchange}:{symbol}", {})
        except:
            return {}
    
    def place_gtt_order(self, gtt: GTTOrder) -> GTTOrder:
        try:
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
            return self.kite.margins().get('equity', {}).get('available', {}).get('live_balance', 0)
        except:
            return 0

class AngelOneBroker(BaseBroker):
    def __init__(self, credentials: Dict):
        super().__init__(credentials)
        self.name = "AngelOne"
        self.smart_api = None
    
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
                self.is_authenticated = True
                return True
            return False
        except Exception as e:
            logger.error(f"AngelOne login error: {e}")
            return False
    
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
        gtt.status = "not_implemented"
        return gtt
    
    def get_available_margin(self) -> float:
        try:
            r = self.smart_api.rmsLimit()
            return float(r['data']['availablecash']) if r['status'] else 0
        except:
            return 0

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
    
    def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict:
        import requests
        url = f"{self.base_url}{endpoint}"
        try:
            if method == "GET":
                r = requests.get(url, headers=self.headers, params=data)
            elif method == "DELETE":
                r = requests.delete(url, headers=self.headers, params=data)
            else:
                r = requests.post(url, headers=self.headers, json=data)
            return r.json()
        except:
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
        gtt.status = "not_implemented"
        return gtt
    
    def get_available_margin(self) -> float:
        r = self._request("GET", "/user/get-funds-and-margin")
        if r.get('status') == 'success':
            return float(r['data'].get('equity', {}).get('available_margin', 0))
        return 0

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
        result['quantity'] = quantity
        result['message'] = "Trade executed"
        
        return result

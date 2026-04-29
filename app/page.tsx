'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorkerPage() {
  const [phone, setPhone] = useState('');
  const [worker, setWorker] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!phone) return;
    
    // Поиск или создание грузчика
    let { data: existing } = await supabase
      .from('workers')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (!existing) {
      const name = prompt('Введите ваше имя:');
      if (!name) return;
      
      const { data: newWorker } = await supabase
        .from('workers')
        .insert([{ phone, name, rating: 5, total_jobs: 0 }])
        .select()
        .single();
      
      setWorker(newWorker);
    } else {
      setWorker(existing);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    
    if (data) setOrders(data);
    setLoading(false);
  };

  const respondToOrder = async (orderId: string, priceOffer: number) => {
    if (!worker) return;
    
    const comment = prompt('Комментарий для клиента (необязательно):');
    
    await supabase.from('responses').insert([{
      order_id: orderId,
      worker_id: worker.id,
      worker_name: worker.name,
      worker_phone: worker.phone,
      price_offer: priceOffer,
      comment: comment || '',
      status: 'pending'
    }]);
    
    alert('Отклик отправлен! Клиент свяжется с вами');
  };

  useEffect(() => {
    if (worker) loadOrders();
  }, [worker]);

  if (!worker) {
    return (
      <div className="container">
        <div className="card">
          <h1>👷 Вход для грузчиков</h1>
          <p>Введите ваш телефон, чтобы начать</p>
          <input
            type="tel"
            placeholder="+7 (999) 123-45-67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button onClick={login}>Войти / Зарегистрироваться</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>🚛 Лента заказов</h1>
      <p>Привет, {worker.name} ⭐ {worker.rating}</p>
      
      <button onClick={loadOrders} style={{ marginBottom: '20px' }}>🔄 Обновить</button>
      
      {loading && <p>Загрузка...</p>}
      
      <div className="orders-list">
        {orders.length === 0 && !loading && <p>🤷 Нет открытых заказов</p>}
        
        {orders.map(order => (
          <div key={order.id} className="order-card">
            <h3>📍 {order.address}</h3>
            <p>{order.work_description}</p>
            <p>💰 {order.tariff === 'hourly' ? `${order.hourly_rate} ₽/час` : `${order.fixed_budget} ₽`}</p>
            <p>📅 {new Date(order.time_slot).toLocaleString()}</p>
            
            <button onClick={() => {
              const price = prompt('Ваша цена (₽):');
              if (price) respondToOrder(order.id, parseInt(price));
            }}>
              💬 Откликнуться
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

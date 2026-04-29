'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorkerPage() {
  const [phone, setPhone] = useState('');
  const [worker, setWorker] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  // Вход / регистрация
  const login = async () => {
    if (!phone || phone.length < 6) {
      alert('Введите корректный телефон');
      return;
    }
    
    // Поиск существующего грузчика
    const { data: existing } = await supabase
      .from('workers')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (existing) {
      setWorker(existing);
      return;
    }
    
    // Новый грузчик
    const name = prompt('Введите ваше имя:');
    if (!name) return;
    
    const { data: newWorker } = await supabase
      .from('workers')
      .insert([{ 
        phone, 
        name, 
        rating: 5, 
        total_jobs: 0,
        is_active: true 
      }])
      .select()
      .single();
    
    if (newWorker) {
      setWorker(newWorker);
    }
  };

  // Загрузка открытых заказов
  const loadOrders = async () => {
    if (!worker) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Ошибка загрузки заказов:', error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  // Отклик на заказ
  const respondToOrder = async (orderId: string) => {
    if (!worker) return;
    
    const priceOffer = prompt('Ваша цена (₽):');
    if (!priceOffer || isNaN(parseInt(priceOffer))) {
      alert('Введите корректную цену');
      return;
    }
    
    const comment = prompt('Комментарий для клиента (необязательно):');
    
    setResponding(orderId);
    
    const { error } = await supabase.from('responses').insert([{
      order_id: orderId,
      worker_id: worker.id,
      worker_name: worker.name,
      worker_phone: worker.phone,
      worker_rating: worker.rating,
      price_offer: parseInt(priceOffer),
      comment: comment || '',
      status: 'pending'
    }]);
    
    setResponding(null);
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      alert('✅ Отклик отправлен! Клиент свяжется с вами');
    }
  };

  // Загружаем заказы при входе
  useEffect(() => {
    if (worker) {
      loadOrders();
      // Обновляем ленту каждые 30 секунд
      const interval = setInterval(loadOrders, 30000);
      return () => clearInterval(interval);
    }
  }, [worker]);

  // Экран входа
  if (!worker) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '32px', padding: '32px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>👷 ПРОЕКТ X</h1>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>Вход для исполнителей</p>
          
          <input
            type="tel"
            placeholder="+7 (999) 123-45-67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '14px', borderRadius: '40px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '16px' }}
          />
          
          <button
            onClick={login}
            style={{ width: '100%', padding: '14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '40px', fontSize: '16px', cursor: 'pointer' }}
          >
            Войти / Зарегистрироваться
          </button>
        </div>
      </div>
    );
  }

  // Основная страница с лентой
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      {/* Шапка профиля */}
      <div style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: 0 }}>👋 Здравствуйте, {worker.name}</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>⭐ {worker.rating} / 5 · Выполнено заказов: {worker.total_jobs || 0}</p>
          </div>
          <button
            onClick={() => setWorker(null)}
            style={{ padding: '8px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}
          >
            Выход
          </button>
        </div>
      </div>

      {/* Управление */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>🚛 Лента заказов</h1>
        <button
          onClick={loadOrders}
          style={{ padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}
        >
          🔄 Обновить
        </button>
      </div>

      {/* Список заказов */}
      {loading && <p style={{ textAlign: 'center', padding: '40px' }}>Загрузка...</p>}
      
      {!loading && orders.length === 0 && (
        <div style={{ background: '#f8fafc', borderRadius: '24px', padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: '#64748b' }}>🤷 Нет открытых заказов</p>
          <p style={{ color: '#94a3b8', marginTop: '8px' }}>Загляните позже — заказы появляются каждый день</p>
        </div>
      )}

      {orders.map(order => (
        <div key={order.id} style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Заказ #{order.id.slice(0, 8)}</span>
            <span style={{ background: '#22c55e', padding: '4px 12px', borderRadius: '40px', fontSize: '12px', color: 'white' }}>Открыт</span>
          </div>
          
          <h3 style={{ marginBottom: '8px' }}>
            📍 
            <a 
              href={`https://maps.yandex.ru/?text=${encodeURIComponent(order.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline', marginLeft: '8px' }}
            >
              {order.address}
            </a>
          </h3>
          
          <p style={{ color: '#475569', marginBottom: '12px' }}>{order.work_description}</p>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>
              {order.tariff === 'hourly' ? `💰 ${order.hourly_rate} ₽/час` : `💰 Фиксированный: ${order.fixed_budget} ₽`}
            </span>
            <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>
              📅 {new Date(order.time_slot).toLocaleString()}
            </span>
          </div>
          
          <button
            onClick={() => respondToOrder(order.id)}
            disabled={responding === order.id}
            style={{ 
              padding: '12px 24px', 
              background: '#0f172a', 
              color: 'white', 
              border: 'none', 
              borderRadius: '40px', 
              cursor: responding === order.id ? 'not-allowed' : 'pointer',
              opacity: responding === order.id ? 0.7 : 1,
              width: '100%'
            }}
          >
            {responding === order.id ? 'Отправка...' : '💬 Откликнуться'}
          </button>
        </div>
      ))}
    </div>
  );
}

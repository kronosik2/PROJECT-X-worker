'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorkerPage() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [worker, setWorker] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'my'>('feed');
  
  // Лента заказов (все открытые)
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Мои заказы
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);
  
  const [responding, setResponding] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [activeResponsesCount, setActiveResponsesCount] = useState(0);

  // Состояния для регистрации
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerAge, setRegisterAge] = useState('');
  const [registerSelfEmployed, setRegisterSelfEmployed] = useState(false);
  const [registerBio, setRegisterBio] = useState('');

  const MAX_ACTIVE_RESPONSES = 3;

  // Валидация телефона
  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    const isValid = cleaned.length === 11 && (cleaned[0] === '7' || cleaned[0] === '8');
    
    if (!isValid && phone.length > 0) {
      setPhoneError('❌ Неверный формат');
    } else {
      setPhoneError('');
    }
    return isValid;
  };

  const formatPhoneForDb = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '8') {
      return '+7' + cleaned.slice(1);
    }
    if (cleaned.length === 11 && cleaned[0] === '7') {
      return '+7' + cleaned.slice(1);
    }
    return phone;
  };

  const loadBalance = async (workerId: string) => {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance, reserved')
      .eq('worker_id', workerId)
      .maybeSingle();
    
    if (wallet) {
      setBalance(wallet.balance - (wallet.reserved || 0));
    }
  };

  const loadActiveResponsesCount = async (workerId: string) => {
    const { data: workerData } = await supabase
      .from('workers')
      .select('active_responses_count')
      .eq('id', workerId)
      .single();
    
    if (workerData) {
      setActiveResponsesCount(workerData.active_responses_count || 0);
    }
  };

  // Загрузка ленты заказов
  const loadOrders = async () => {
    if (!worker) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'open')
        .limit(20)
        .order('created_at', { ascending: false });
      
      if (!error && data) setOrders(data);
    } catch (err) {
      console.error('Ошибка загрузки заказов:', err);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка моих заказов
  const loadMyOrders = async () => {
    if (!worker) return;
    setLoadingMy(true);
    try {
      const { data, error } = await supabase
        .from('responses')
        .select(`
          id,
          worker_status,
          price_offer,
          comment,
          created_at,
          orders (
            id,
            address,
            work_description,
            tariff,
            hourly_rate,
            fixed_budget,
            time_slot,
            status as order_status,
            client_phone
          )
        `)
        .eq('worker_id', worker.id)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        const formatted = data.map((r: any) => ({
          id: r.id,
          worker_status: r.worker_status,
          price_offer: r.price_offer,
          comment: r.comment,
          created_at: r.created_at,
          order: r.orders
        }));
        setMyOrders(formatted);
      }
    } catch (err) {
      console.error('Ошибка загрузки моих заказов:', err);
    } finally {
      setLoadingMy(false);
    }
  };

  // Отклик на заказ
  const respondToOrder = async (orderId: string) => {
    if (!worker) return;
    
    if (activeResponsesCount >= MAX_ACTIVE_RESPONSES) {
      alert(`❌ Вы уже откликнулись на ${MAX_ACTIVE_RESPONSES} заказов. Дождитесь ответа клиента.`);
      return;
    }
    
    if (balance < 10) {
      alert('❌ Недостаточно средств на балансе для резерва');
      return;
    }
    
    const priceOffer = prompt('Ваша цена (₽):');
    if (!priceOffer || isNaN(parseInt(priceOffer))) {
      alert('Введите корректную цену');
      return;
    }
    
    const comment = prompt('Комментарий для клиента (необязательно):');
    setResponding(orderId);
    
    // Сначала резервируем деньги
    const { error: walletError } = await supabase.rpc('reserve_funds', {
      p_worker_id: worker.id,
      p_amount: 10
    });
    
    if (walletError) {
      alert('Ошибка резерва средств: ' + walletError.message);
      setResponding(null);
      return;
    }
    
    // Создаём отклик
    const { data, error } = await supabase
      .from('responses')
      .insert([{
        order_id: orderId,
        worker_id: worker.id,
        worker_name: worker.name,
        worker_phone: worker.phone,
        worker_rating: worker.rating,
        price_offer: parseInt(priceOffer),
        comment: comment || '',
        worker_status: 'pending',
        hold_amount: 10
      }])
      .select();
    
    setResponding(null);
    
    if (error) {
      alert('Ошибка: ' + error.message);
      await supabase.rpc('release_funds', { p_worker_id: worker.id, p_amount: 10 });
    } else {
      alert('✅ Отклик отправлен! Резерв 10₽');
      await loadBalance(worker.id);
      await loadActiveResponsesCount(worker.id);
      await loadMyOrders();
    }
  };

  // Подтверждение заказа (когда клиент выбрал)
  const confirmOrder = async (responseId: string, orderId: string) => {
    const { error } = await supabase
      .from('responses')
      .update({ worker_status: 'confirmed' })
      .eq('id', responseId);
    
    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }
    
    // Обновляем статус заказа
    await supabase
      .from('orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);
    
    // Списываем деньги (уже зарезервированы)
    await supabase.rpc('finalize_payment', {
      p_worker_id: worker.id,
      p_amount: 10
    });
    
    alert('✅ Заказ подтверждён! Приступайте к работе');
    await loadBalance(worker.id);
    await loadActiveResponsesCount(worker.id);
    await loadMyOrders();
    await loadOrders();
  };

  // Завершение заказа
  const completeOrder = async (responseId: string, orderId: string) => {
    if (!confirm('Вы точно завершили заказ? Клиент получит уведомление')) return;
    
    await supabase
      .from('responses')
      .update({ worker_status: 'completed' })
      .eq('id', responseId);
    
    await supabase
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', orderId);
    
    alert('✅ Заказ завершён! Спасибо за работу');
    await loadActiveResponsesCount(worker.id);
    await loadMyOrders();
    await loadOrders();
  };

  // Отмена заказа
  const cancelOrder = async (responseId: string, orderId: string) => {
    if (!confirm('Отменить заказ? Деньги вернутся на баланс')) return;
    
    // Возвращаем деньги
    await supabase.rpc('release_funds', { p_worker_id: worker.id, p_amount: 10 });
    
    await supabase
      .from('responses')
      .update({ worker_status: 'cancelled' })
      .eq('id', responseId);
    
    await supabase
      .from('orders')
      .update({ status: 'open' })
      .eq('id', orderId);
    
    alert('❌ Заказ отменён, деньги возвращены');
    await loadBalance(worker.id);
    await loadActiveResponsesCount(worker.id);
    await loadMyOrders();
    await loadOrders();
  };

  // Вход/регистрация (оставляем как было)
  const handleLogin = async () => { /* ... как раньше */ };
  const handleRegister = async () => { /* ... как раньше */ };

  // Загружаем данные при входе
  useEffect(() => {
    if (worker) {
      loadBalance(worker.id);
      loadActiveResponsesCount(worker.id);
      loadOrders();
      loadMyOrders();
    }
  }, [worker]);

  // Если не вошли — показываем форму входа (как раньше)
  if (!worker) {
    return ( /* форма входа/регистрации, оставляем как было */ );
  }

  // Основной интерфейс с двумя вкладками
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      {/* Шапка профиля */}
      <div style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2>👋 {worker.name}, {worker.age} лет</h2>
            <p>⭐ {worker.rating} / 5 · Выполнено: {worker.total_jobs || 0}</p>
            <p>💰 Доступно: {balance} ₽</p>
            <p style={{ fontSize: '13px', color: activeResponsesCount >= MAX_ACTIVE_RESPONSES ? '#ef4444' : '#22c55e' }}>
              📋 Активных откликов: {activeResponsesCount}/{MAX_ACTIVE_RESPONSES}
            </p>
          </div>
          <button onClick={() => setWorker(null)} style={{ padding: '8px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>Выход</button>
        </div>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => setActiveTab('feed')} style={{ flex: 1, padding: '12px', borderRadius: '40px', border: 'none', background: activeTab === 'feed' ? '#0f172a' : '#e2e8f0', color: activeTab === 'feed' ? 'white' : '#0f172a', cursor: 'pointer' }}>
          🚛 Лента заказов
        </button>
        <button onClick={() => setActiveTab('my')} style={{ flex: 1, padding: '12px', borderRadius: '40px', border: 'none', background: activeTab === 'my' ? '#0f172a' : '#e2e8f0', color: activeTab === 'my' ? 'white' : '#0f172a', cursor: 'pointer' }}>
          📋 Мои заказы
        </button>
      </div>

      {/* Лента заказов */}
      {activeTab === 'feed' && (
        <>
          <button onClick={loadOrders} style={{ marginBottom: '20px', padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>🔄 Обновить</button>
          {loading && <p>⏳ Загрузка...</p>}
          {!loading && orders.length === 0 && <p>🤷 Нет открытых заказов</p>}
          {orders.map(order => (
            <div key={order.id} style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <h3>📍 {order.address}</h3>
              <p>{order.work_description}</p>
              <p>💰 {order.tariff === 'hourly' ? `${order.hourly_rate} ₽/час` : `${order.fixed_budget} ₽`}</p>
              <p>📅 {new Date(order.time_slot).toLocaleString()}</p>
              <button onClick={() => respondToOrder(order.id)} disabled={responding === order.id || activeResponsesCount >= MAX_ACTIVE_RESPONSES || balance < 10} style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>
                {responding === order.id ? 'Отправка...' : '💬 Откликнуться (10₽)'}
              </button>
            </div>
          ))}
        </>
      )}

      {/* Мои заказы */}
      {activeTab === 'my' && (
        <>
          <button onClick={loadMyOrders} style={{ marginBottom: '20px', padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>🔄 Обновить</button>
          {loadingMy && <p>⏳ Загрузка...</p>}
          {!loadingMy && myOrders.length === 0 && <p>🤷 У вас пока нет откликов</p>}
          
          {myOrders.map((item: any) => {
            const order = item.order;
            const status = item.worker_status;
            
            let statusText = '';
            let statusColor = '';
            let buttons = null;
            
            if (status === 'pending') {
              statusText = '⏳ Ожидает ответа клиента';
              statusColor = '#f59e0b';
              buttons = <button onClick={() => cancelOrder(item.id, order.id)} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>Отменить отклик</button>;
            } else if (status === 'approved') {
              statusText = '✅ Клиент выбрал вас! Подтвердите заказ';
              statusColor = '#22c55e';
              buttons = <button onClick={() => confirmOrder(item.id, order.id)} style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>Подтвердить заказ</button>;
            } else if (status === 'confirmed') {
              statusText = '🚚 В работе';
              statusColor = '#3b82f6';
              buttons = <button onClick={() => completeOrder(item.id, order.id)} style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>Завершить заказ</button>;
            } else if (status === 'completed') {
              statusText = '✅ Выполнен ✓';
              statusColor = '#10b981';
              buttons = null;
            } else if (status === 'cancelled') {
              statusText = '❌ Отменён';
              statusColor = '#ef4444';
              buttons = null;
            }
            
            return (
              <div key={item.id} style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ background: statusColor, padding: '4px 12px', borderRadius: '40px', fontSize: '12px', color: 'white' }}>{statusText}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Ваша цена: {item.price_offer} ₽</span>
                </div>
                <h3>📍 {order.address}</h3>
                <p>{order.work_description}</p>
                <p>📅 {new Date(order.time_slot).toLocaleString()}</p>
                {item.comment && <p>💬 Ваш комментарий: {item.comment}</p>}
                {buttons}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

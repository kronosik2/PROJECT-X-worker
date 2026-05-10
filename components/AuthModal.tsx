'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface AuthModalProps {
  role: 'client' | 'worker';
  onLogin: (user: any) => void;
}

export default function AuthModal({ role, onLogin }: AuthModalProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Временная заглушка
  const sendSmsCode = async (phoneNumber: string) => {
    const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem(`verify_${phoneNumber}`, mockCode);
    console.log(`📱 Код для ${phoneNumber}: ${mockCode}`);
    alert(`Тестовый режим: ваш код ${mockCode}`);
    return mockCode;
  };

  const handleSendCode = async () => {
    if (!phone || phone.length < 10) {
      alert('Введите корректный номер телефона');
      return;
    }
    
    setLoading(true);
    await sendSmsCode(phone);
    setStep('code');
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    if (!code) {
      alert('Введите код из SMS');
      return;
    }

    const savedCode = localStorage.getItem(`verify_${phone}`);
    if (code !== savedCode) {
      alert('Неверный код');
      return;
    }

    setLoading(true);
    
    const table = role === 'client' ? 'clients' : 'workers';
    let { data: existing } = await supabase
      .from(table)
      .select('*')
      .eq('phone', phone)
      .single();

    if (!existing) {
      if (role === 'client') {
        const { data: newClient } = await supabase
          .from(table)
          .insert({ phone, name: phone })
          .select()
          .single();
        existing = newClient;
      } else {
        const { data: newWorker } = await supabase
          .from(table)
          .insert({ phone, name: phone, age: 25, balance: 500 })
          .select()
          .single();
        existing = newWorker;
      }
    }

    if (existing) {
      localStorage.setItem(role === 'client' ? 'client_id' : 'worker_id', existing.id);
      localStorage.removeItem(`verify_${phone}`);
      onLogin(existing);
    }
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-center mb-6">
          {role === 'client' ? '🤝 ПРОЕКТ X' : '👷 ПРОЕКТ X'}
        </h2>
        
        {step === 'phone' ? (
          <>
            <p className="text-gray-600 text-center mb-6">
              {role === 'client' ? 'Вход для клиентов' : 'Вход для исполнителей'}
            </p>
            <input
              type="tel"
              placeholder="+7 (999) 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-center text-lg"
              autoFocus
            />
            <button
              onClick={handleSendCode}
              disabled={loading}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
            >
              {loading ? 'Отправка...' : 'Получить код'}
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-600 text-center mb-6">
              Введите код из SMS<br />
              <span className="text-sm text-gray-400">Отправлен на {phone}</span>
            </p>
            <input
              type="text"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
              maxLength={6}
              autoFocus
            />
            <button
              onClick={handleVerifyCode}
              disabled={loading}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
            >
              {loading ? 'Проверка...' : 'Войти'}
            </button>
            <button
              onClick={() => {
                setStep('phone');
                setCode('');
              }}
              className="w-full mt-3 text-gray-500 text-sm hover:text-gray-700 transition"
            >
              ← Назад
            </button>
          </>
        )}
      </div>
    </div>
  );
}

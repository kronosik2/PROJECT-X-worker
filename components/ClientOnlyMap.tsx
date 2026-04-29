'use client';
import dynamic from 'next/dynamic';

const YandexMap = dynamic(() => import('./YandexMap'), {
  ssr: false,
  loading: () => <div style={{ height: '400px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Загрузка карты...</div>
});

export default function ClientOnlyMap(props: any) {
  return <YandexMap {...props} />;
}

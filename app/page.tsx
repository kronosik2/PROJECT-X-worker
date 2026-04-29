import dynamic from 'next/dynamic'

const WorkerPage = dynamic(() => import('./page.client'), {
  ssr: false,
  loading: () => <div>Загрузка...</div>
})

export default function WorkerPageWrapper() {
  return <WorkerPage />
}

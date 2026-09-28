import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import './index.css';

document.documentElement.dataset.theme = localStorage.getItem('duka.theme') ?? 'dark';
const qc = new QueryClient({ defaultOptions: { queries: { networkMode: 'offlineFirst', staleTime: 60_000, retry: 1 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={qc}><App /></QueryClientProvider></React.StrictMode>);

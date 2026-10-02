import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configurationError } from './lib/config';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const error = configurationError();
if (error) {
  root.render(
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div role="alert" className="max-w-lg rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-bold text-slate-800 mb-3">Configuração pendente</h1>
        <p className="text-slate-600">{error}</p>
        <p className="text-sm text-slate-500 mt-3">Solicite ao responsável pela aplicação que conclua a configuração e publique novamente.</p>
      </div>
    </main>
  );
} else {
  // Import only after validating configuration: createClient otherwise throws
  // during module evaluation, leaving a blank screen before React can render.
  import('./App.tsx').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>);
  }).catch((loadError: unknown) => {
    console.error('Erro ao iniciar aplicação:', loadError);
    root.render(<p role="alert">Não foi possível carregar a aplicação. Atualize a página e tente novamente.</p>);
  });
}

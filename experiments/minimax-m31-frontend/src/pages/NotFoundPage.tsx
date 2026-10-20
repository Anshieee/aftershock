import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { Wordmark } from '../components/Wordmark';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-[44ch] text-center">
        <Wordmark size="lg" className="justify-center" />
        <h1 className="mt-8 font-display text-2xl font-semibold text-ink">
          That page does not exist
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          The address may be from an older build. The guided example is the best place to start.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" size="sm" onClick={() => navigate('/')}>
            Back to the launcher
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/i/doc-demo-manuscript/read')}
          >
            Open the example
          </Button>
        </div>
      </div>
    </div>
  );
}

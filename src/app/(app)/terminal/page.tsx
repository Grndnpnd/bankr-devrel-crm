import Terminal from '@/components/pages/Terminal';

export const dynamic = 'force-dynamic';

// Terminal (agent) is available to everyone — no pillar gate.
export default function Page() {
  return <Terminal />;
}

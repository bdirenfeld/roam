import { notFound } from 'next/navigation';
import { devPreviewAllowed } from '../phone/devOnly';
import FirstPointer from './FirstPointer';

export default function Page() {
  if (!devPreviewAllowed()) notFound();
  return <FirstPointer />;
}

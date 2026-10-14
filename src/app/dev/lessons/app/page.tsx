import { notFound } from 'next/navigation';
import { devPreviewAllowed } from '../../phone/devOnly';
import { AppWalkthroughPreview } from '../LessonJourney';
export default function Page() { if (!devPreviewAllowed()) notFound(); return <AppWalkthroughPreview />; }

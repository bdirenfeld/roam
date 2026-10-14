import { notFound } from 'next/navigation';
import { devPreviewAllowed } from '../phone/devOnly';
import LessonReview from './LessonReview';
export default function Page() { if (!devPreviewAllowed()) notFound(); return <LessonReview />; }

import { notFound } from 'next/navigation';
import { devPreviewAllowed } from '../../phone/devOnly';
import { isLesson } from '../lessonState';
import LessonJourney from '../LessonJourney';
export default function Page({ params }: { params: { lesson: string } }) {
  if (!devPreviewAllowed() || !isLesson(params.lesson)) notFound();
  return <LessonJourney lesson={params.lesson} />;
}

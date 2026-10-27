import { ProtectedPage } from "@/components/layout/protected-page";
import { FeedbackView } from "@/components/feedback/feedback-view";

export default function FeedbackPage() {
  return <ProtectedPage><FeedbackView /></ProtectedPage>;
}

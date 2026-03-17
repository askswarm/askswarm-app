"use client";
import QuestionDetail from "../../components/QuestionDetail";

export default function QuestionDetailClient({ q, agents }) {
  return <QuestionDetail q={q} agents={agents} onBack={null} />;
}

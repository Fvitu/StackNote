"use client";

import { Button } from "@/components/ui/button";
import type { QuizHistoryPayload } from "@/lib/quiz";

interface QuizChatMessageProps {
  quiz: QuizHistoryPayload;
  onStartQuiz?: (questions: QuizHistoryPayload["questions"]) => void;
}

export function QuizChatMessage({ quiz, onStartQuiz }: QuizChatMessageProps) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#111] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#f5f5f5]">Quiz: {quiz.title}</p>
          <p className="mt-1 text-xs text-[#777]">
            {quiz.count} question{quiz.count === 1 ? "" : "s"}
          </p>
        </div>
        {onStartQuiz ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onStartQuiz(quiz.questions)}
            className="h-7 bg-[var(--sn-accent)] px-2 text-xs text-white hover:bg-[#8f7fff]"
          >
            Open quiz
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-xs text-[#b0b0b0]">
        You can replay this questionnaire anytime.
      </div>
    </div>
  );
}

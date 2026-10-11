import { ChartLine, Compass, Gauge, Rocket, TrendingDown, Workflow, type LucideIcon } from "lucide-react";

export interface Suggestion {
  topic: string;
  question: string;
  Icon: LucideIcon;
}

/**
 * Hardcoded for now. SPEC-v2 §13 wants these generated from the corpus, which
 * needs the corpus summarised at build time. Until then each one is a question
 * answerable from a document already in the index, so none of them is a
 * promise the retrieval cannot keep.
 */
export const SUGGESTIONS: readonly Suggestion[] = [
  { topic: "Impact", question: "What has he actually shipped end to end?", Icon: Rocket },
  { topic: "Skills", question: "How strong is he on PyTorch, really?", Icon: Gauge },
  { topic: "Automation", question: "What did he automate at Capgemini?", Icon: Workflow },
  { topic: "Lessons", question: "What went wrong with the delivery-time model?", Icon: TrendingDown },
  { topic: "Career", question: "Why did he leave IT support for an MSc?", Icon: Compass },
  { topic: "Data", question: "What did he find in the NYC taxi data?", Icon: ChartLine },
];

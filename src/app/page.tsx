"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type InterviewQuestion = {
  question: string;
  intent: string;
  answerHint: string;
};

type AnalysisResult = {
  jobKeywords: string[];
  matchScore: number;
  gapAnalysis: string[];
  improvedBullets: string[];
  interviewQuestions: InterviewQuestion[];
  error?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ScoreCardData = {
  totalScore?: string;
  clarityScore?: string;
  relevanceScore?: string;
  completenessScore?: string;
  structureScore?: string;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  sampleAnswer?: string;
  nextStep?: string;
};

type SummaryReportData = {
  overallEvaluation?: string;
  overallScore?: string;
  highlights?: string[];
  problems?: string[];
  prioritySkills?: string[];
  improvementSuggestions?: string[];
  nextRoundSuggestion?: string;
};

const STORAGE_KEYS = {
  jd: "resume-agent-jd",
  result: "resume-agent-result",
  messages: "resume-agent-messages",
  interviewerMode: "resume-agent-interviewer-mode",
  uploadedFileName: "resume-agent-uploaded-file-name",
  uploadedText: "resume-agent-uploaded-text",
};

const DEFAULT_ASSISTANT_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "你好，我是你的 AI 面试助手。你可以让我模拟面试、点评你的回答，或者结合岗位 JD 和你上传的简历 / PDF / 图片来帮你准备面试。",
};

function parseBulletSection(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•\d.\s]+/, "").trim())
    .filter(Boolean);
}

function parseScoreCard(content: string): ScoreCardData | null {
  if (!content.includes("【评分】")) return null;

  const getSection = (title: string, nextTitles: string[]) => {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextPattern = nextTitles
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    const regex = new RegExp(
      `【${escapedTitle}】([\\s\\S]*?)(?=【(?:${nextPattern})】|$)`
    );

    const match = content.match(regex);
    return match?.[1]?.trim() || "";
  };

  const scoreSection = getSection("评分", [
    "回答优点",
    "主要不足",
    "改进建议",
    "参考回答",
    "下一步",
  ]);

  const strengthsSection = getSection("回答优点", [
    "主要不足",
    "改进建议",
    "参考回答",
    "下一步",
  ]);

  const weaknessesSection = getSection("主要不足", [
    "改进建议",
    "参考回答",
    "下一步",
  ]);

  const suggestionsSection = getSection("改进建议", ["参考回答", "下一步"]);

  const sampleAnswerSection = getSection("参考回答", ["下一步"]);
  const nextStepSection = getSection("下一步", []);

  const totalScore = scoreSection.match(/总分[:：]\s*([^\n]+)/)?.[1]?.trim();
  const clarityScore = scoreSection
    .match(/表达清晰度[:：]\s*([^\n]+)/)?.[1]
    ?.trim();
  const relevanceScore = scoreSection
    .match(/岗位匹配度[:：]\s*([^\n]+)/)?.[1]
    ?.trim();
  const completenessScore = scoreSection
    .match(/内容完整度[:：]\s*([^\n]+)/)?.[1]
    ?.trim();
  const structureScore = scoreSection
    .match(/逻辑结构[:：]\s*([^\n]+)/)?.[1]
    ?.trim();

  return {
    totalScore,
    clarityScore,
    relevanceScore,
    completenessScore,
    structureScore,
    strengths: parseBulletSection(strengthsSection),
    weaknesses: parseBulletSection(weaknessesSection),
    suggestions: parseBulletSection(suggestionsSection),
    sampleAnswer: sampleAnswerSection || undefined,
    nextStep: nextStepSection || undefined,
  };
}

function parseSummaryReport(content: string): SummaryReportData | null {
  if (!content.includes("【面试总结报告】")) return null;

  const getSection = (title: string, nextTitles: string[]) => {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextPattern = nextTitles
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    const regex = new RegExp(
      `【${escapedTitle}】([\\s\\S]*?)(?=【(?:${nextPattern})】|$)`
    );

    const match = content.match(regex);
    return match?.[1]?.trim() || "";
  };

  const reportHeader = getSection("面试总结报告", [
    "表现亮点",
    "主要问题",
    "最该优先补的能力",
    "后续改进建议",
    "下一轮建议",
  ]);

  const highlightsSection = getSection("表现亮点", [
    "主要问题",
    "最该优先补的能力",
    "后续改进建议",
    "下一轮建议",
  ]);

  const problemsSection = getSection("主要问题", [
    "最该优先补的能力",
    "后续改进建议",
    "下一轮建议",
  ]);

  const skillsSection = getSection("最该优先补的能力", [
    "后续改进建议",
    "下一轮建议",
  ]);

  const suggestionsSection = getSection("后续改进建议", ["下一轮建议"]);
  const nextRoundSection = getSection("下一轮建议", []);

  const overallEvaluation = reportHeader
    .match(/总体评价[:：]\s*([^\n]+)/)?.[1]
    ?.trim();

  const overallScore = reportHeader
    .match(/综合得分[:：]\s*([^\n]+)/)?.[1]
    ?.trim();

  return {
    overallEvaluation,
    overallScore,
    highlights: parseBulletSection(highlightsSection),
    problems: parseBulletSection(problemsSection),
    prioritySkills: parseBulletSection(skillsSection),
    improvementSuggestions: parseBulletSection(suggestionsSection),
    nextRoundSuggestion: nextRoundSection || undefined,
  };
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);

  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean).join(" / ");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (
      typeof obj.question === "string" ||
      typeof obj.intent === "string" ||
      typeof obj.answerHint === "string"
    ) {
      return [obj.question, obj.intent, obj.answerHint]
        .filter((item) => typeof item === "string" && String(item).trim())
        .join(" / ");
    }

    return JSON.stringify(obj, null, 2);
  }

  return String(value);
}

function ScoreMetricCard({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  if (!value) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ScoreCard({ data }: { data: ScoreCardData }) {
  return (
    <div className="mt-3 overflow-hidden rounded-3xl border border-indigo-200 bg-indigo-50/60">
      <div className="border-b border-indigo-200 bg-white/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">面试回答评分</h4>
            <p className="mt-1 text-xs text-slate-500">
              基于当前回答生成的结构化评估结果
            </p>
          </div>

          {data.totalScore ? (
            <div className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm">
              总分：{data.totalScore}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ScoreMetricCard label="表达清晰度" value={data.clarityScore} />
          <ScoreMetricCard label="岗位匹配度" value={data.relevanceScore} />
          <ScoreMetricCard label="内容完整度" value={data.completenessScore} />
          <ScoreMetricCard label="逻辑结构" value={data.structureScore} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">回答优点</h5>
            {data.strengths?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.strengths.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">主要不足</h5>
            {data.weaknesses?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.weaknesses.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">改进建议</h5>
            {data.suggestions?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.suggestions.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>
        </div>

        {data.sampleAnswer ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">参考回答</h5>
            <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {data.sampleAnswer}
            </div>
          </div>
        ) : null}

        {data.nextStep ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">下一步</h5>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {data.nextStep}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryReportCard({ data }: { data: SummaryReportData }) {
  return (
    <div className="mt-3 overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50/70">
      <div className="border-b border-emerald-200 bg-white/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">面试总结报告</h4>
            <p className="mt-1 text-xs text-slate-500">
              基于整轮面试表现生成的复盘结果
            </p>
          </div>

          {data.overallScore ? (
            <div className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
              综合得分：{data.overallScore}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 p-5">
        {data.overallEvaluation ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">总体评价</h5>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {data.overallEvaluation}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">表现亮点</h5>
            {data.highlights?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.highlights.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">主要问题</h5>
            {data.problems?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.problems.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">
              最该优先补的能力
            </h5>
            {data.prioritySkills?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.prioritySkills.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">
              后续改进建议
            </h5>
            {data.improvementSuggestions?.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {data.improvementSuggestions.map((item, index) => (
                  <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">暂无</p>
            )}
          </div>
        </div>

        {data.nextRoundSuggestion ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h5 className="text-sm font-semibold text-slate-900">下一轮建议</h5>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {data.nextRoundSuggestion}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const scoreCardData = useMemo(() => parseScoreCard(content), [content]);
  const summaryReportData = useMemo(() => parseSummaryReport(content), [content]);

  if (summaryReportData) {
    return (
      <div>
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
          {content}
        </div>
        <SummaryReportCard data={summaryReportData} />
      </div>
    );
  }

  if (scoreCardData) {
    return (
      <div>
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
          {content}
        </div>
        <ScoreCard data={scoreCardData} />
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-7">
      {content}
    </div>
  );
}

export default function Home() {
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([
    DEFAULT_ASSISTANT_MESSAGE,
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [interviewerMode, setInterviewerMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [showJdPanel, setShowJdPanel] = useState(true);
  const [showResultPanel, setShowResultPanel] = useState(true);

  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedText, setUploadedText] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [fileError, setFileError] = useState("");

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatSectionRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldScrollAfterSendRef = useRef(false);

  const isFocusMode = !showJdPanel && !showResultPanel;
  const canAnalyze = jd.trim().length > 0 || uploadedText.trim().length > 0;

  useEffect(() => {
    try {
      const savedJd = localStorage.getItem(STORAGE_KEYS.jd);
      const savedResult = localStorage.getItem(STORAGE_KEYS.result);
      const savedMessages = localStorage.getItem(STORAGE_KEYS.messages);
      const savedInterviewerMode = localStorage.getItem(
        STORAGE_KEYS.interviewerMode
      );
      const savedUploadedFileName = localStorage.getItem(
        STORAGE_KEYS.uploadedFileName
      );
      const savedUploadedText = localStorage.getItem(STORAGE_KEYS.uploadedText);

      if (savedJd) setJd(savedJd);
      if (savedResult) setResult(JSON.parse(savedResult));

      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages) as ChatMessage[];
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          setMessages(parsedMessages);
        }
      }

      if (savedInterviewerMode) {
        setInterviewerMode(savedInterviewerMode === "true");
      }

      if (savedUploadedFileName) setUploadedFileName(savedUploadedFileName);
      if (savedUploadedText) setUploadedText(savedUploadedText);
    } catch (err) {
      console.error("读取本地缓存失败:", err);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.jd, jd);
  }, [jd, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.result, JSON.stringify(result));
  }, [result, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEYS.interviewerMode,
      String(interviewerMode)
    );
  }, [interviewerMode, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.uploadedFileName, uploadedFileName);
  }, [uploadedFileName, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.uploadedText, uploadedText);
  }, [uploadedText, hydrated]);

  useEffect(() => {
    if (!shouldScrollAfterSendRef.current) return;

    if (!isFocusMode) {
      chatSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    const timer = setTimeout(() => {
      const container = chatContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      }
      shouldScrollAfterSendRef.current = false;
    }, 250);

    return () => clearTimeout(timer);
  }, [messages, isFocusMode]);

  useEffect(() => {
    if (isFocusMode) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isFocusMode]);

  const autoResizeTextarea = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [chatInput]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError("");
    setIsUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-file", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "文件解析失败");
      }

      setUploadedFileName(data.fileName || file.name);
      setUploadedText(data.extractedText || "");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "文件解析失败，请稍后重试";
      setFileError(message);
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
  };

  const clearUploadedFile = () => {
    setUploadedFileName("");
    setUploadedText("");
    setFileError("");
  };

  const handleAnalyze = async () => {
    setError("");
    setResult(null);

    if (!canAnalyze) {
      setError("请先输入岗位 JD，或上传一份简历 / PDF / 图片文件");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobDescription: jd,
          uploadedText,
          uploadedFileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "请求失败");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError("请求失败，请检查服务是否正常");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    shouldScrollAfterSendRef.current = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          jobDescription: jd,
          analysisResult: result,
          interviewerMode,
          summaryMode: false,
          uploadedText,
          uploadedFileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.error || "对话请求失败，请稍后再试。",
          },
        ]);
        return;
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.reply || "模型没有返回内容。",
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "对话请求失败，请检查服务是否正常。",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleStartInterview = async () => {
    if (chatLoading) return;

    const startMessage: ChatMessage = {
      role: "user",
      content:
        "开始面试。请基于岗位 JD、分析结果、我上传的材料和我后续的回答动态生成问题。一次只问一个问题，不要限制为预设题库，也不要在问完固定数量后自动结束，除非我明确说结束。",
    };

    const nextMessages = [...messages, startMessage];
    setMessages(nextMessages);
    setChatLoading(true);
    shouldScrollAfterSendRef.current = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          jobDescription: jd,
          analysisResult: result,
          interviewerMode: true,
          summaryMode: false,
          uploadedText,
          uploadedFileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.error || "开启面试失败，请稍后再试。",
          },
        ]);
        return;
      }

      setInterviewerMode(true);
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.reply || "模型没有返回内容。",
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "开启面试失败，请检查服务是否正常。",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (chatLoading || messages.length < 2) return;

    const summaryTriggerMessage: ChatMessage = {
      role: "user",
      content: "请基于这轮面试对话生成总结报告。",
    };

    const nextMessages = [...messages, summaryTriggerMessage];
    setMessages(nextMessages);
    setChatLoading(true);
    shouldScrollAfterSendRef.current = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          jobDescription: jd,
          analysisResult: result,
          interviewerMode: true,
          summaryMode: true,
          uploadedText,
          uploadedFileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.error || "生成总结报告失败，请稍后再试。",
          },
        ]);
        return;
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.reply || "模型没有返回内容。",
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "生成总结报告失败，请检查服务是否正常。",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([DEFAULT_ASSISTANT_MESSAGE]);
    setInterviewerMode(false);
    localStorage.removeItem(STORAGE_KEYS.messages);
    localStorage.removeItem(STORAGE_KEYS.interviewerMode);
  };

  const handleClearAllData = () => {
    setJd("");
    setResult(null);
    setError("");
    setMessages([DEFAULT_ASSISTANT_MESSAGE]);
    setInterviewerMode(false);
    setChatInput("");
    setUploadedFileName("");
    setUploadedText("");
    setFileError("");

    localStorage.removeItem(STORAGE_KEYS.jd);
    localStorage.removeItem(STORAGE_KEYS.result);
    localStorage.removeItem(STORAGE_KEYS.messages);
    localStorage.removeItem(STORAGE_KEYS.interviewerMode);
    localStorage.removeItem(STORAGE_KEYS.uploadedFileName);
    localStorage.removeItem(STORAGE_KEYS.uploadedText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const capabilityItems = [
    "识别岗位关键词",
    "生成匹配度分数",
    "简历差距分析",
    "回答优化建议",
    "多轮对话式准备",
    "动态面试官模式",
    "结构化评分反馈",
    "总结报告生成",
    "本地对话持久化",
    "支持文件上传分析",
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f8fafc_38%,#f8fafc_100%)] text-slate-900">
      <div
        className={`mx-auto px-4 py-4 md:px-6 ${
          isFocusMode ? "max-w-[1600px]" : "max-w-[1800px] xl:px-8 xl:py-8"
        }`}
      >
        {!isFocusMode ? (
          <section className="mb-8 overflow-hidden rounded-[32px] border border-slate-200 bg-white/90 shadow-[0_10px_35px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="grid gap-0 xl:grid-cols-[1.55fr_0.95fr]">
              <div className="relative px-8 py-8">
                <div className="absolute right-6 top-4 h-28 w-28 rounded-full bg-blue-100/60 blur-3xl" />
                <div className="absolute bottom-4 left-16 h-24 w-24 rounded-full bg-cyan-100/60 blur-3xl" />

                <div className="relative space-y-3">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                    Resume Interview Agent
                  </span>
                  <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                    Resume Interview Agent
                  </h1>
                  <p className="max-w-4xl text-base leading-7 text-slate-600 md:text-lg">
                    输入岗位 JD，或上传简历 / PDF / 图片等补充材料，获得结构化分析；再通过右侧更大的
                    AI 对话工作区进行面试模拟、回答优化、多轮追问和面试官模式训练。
                  </p>
                  <p className="text-sm text-slate-500">
                    当前版本已支持本地持久化：刷新页面后会保留 JD、分析结果、聊天记录和上传文件解析结果。
                  </p>

                  <div className="pt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                      AI 面试训练
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                      文件上传分析
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                      结构化评分
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                      总结报告
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-6 xl:border-l xl:border-t-0">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">当前能力</h2>
                  <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                    Ready
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 xl:grid-cols-2">
                  {capabilityItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm"
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                        ✓
                      </div>
                      <span className="leading-5">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div
          className={`grid gap-8 ${
            isFocusMode ? "xl:grid-cols-1" : "xl:grid-cols-[0.88fr_1.32fr]"
          }`}
        >
          {!isFocusMode ? (
            <div className="space-y-8">
              {showJdPanel ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">输入岗位信息</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        粘贴目标岗位 JD，或者上传简历 / PDF / 图片等补充材料，生成结构化分析结果。
                      </p>
                    </div>

                    <button
                      onClick={() => setShowJdPanel(false)}
                      className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      收起
                    </button>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label
                        htmlFor="jd"
                        className="text-sm font-medium text-slate-700"
                      >
                        Job Description
                      </label>
                      <textarea
                        id="jd"
                        className="min-h-[260px] w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-7 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
                        placeholder="Paste JD here..."
                        value={jd}
                        onChange={(e) => setJd(e.target.value)}
                      />
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            上传补充材料
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            支持 PDF、DOCX、TXT、图片。可上传简历、项目说明、证书、作品截图等。
                          </p>
                        </div>

                        <label className="inline-flex cursor-pointer items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                          <input
                            type="file"
                            accept=".pdf,.docx,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                          {isUploadingFile ? "上传解析中..." : "选择文件"}
                        </label>
                      </div>

                      {uploadedFileName ? (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-emerald-800">
                                已上传文件
                              </div>
                              <div className="mt-1 break-all text-xs text-emerald-700">
                                {uploadedFileName}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={clearUploadedFile}
                              className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                            >
                              移除文件
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {fileError ? (
                        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {fileError}
                        </div>
                      ) : null}

                      {uploadedText ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-medium text-slate-800">
                              已提取内容预览
                            </h4>
                            <span className="text-xs text-slate-500">
                              {uploadedText.length} chars
                            </span>
                          </div>
                          <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
                            {uploadedText.slice(0, 1800)}
                            {uploadedText.length > 1800
                              ? "\n\n...（预览已截断）"
                              : ""}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {error ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleAnalyze}
                        disabled={loading || isUploadingFile || !canAnalyze}
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {loading ? "分析中..." : "开始分析"}
                      </button>

                      <button
                        onClick={handleClearAllData}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        清空全部数据
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {showResultPanel ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold">分析结果</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        这些结果会被注入右侧对话上下文，驱动更贴近岗位与候选人背景的模拟面试。
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                        {loading
                          ? "Analyzing"
                          : result
                          ? "Result Ready"
                          : "Waiting for Input"}
                      </div>

                      <button
                        onClick={() => setShowResultPanel(false)}
                        className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        收起
                      </button>
                    </div>
                  </div>

                  {!result && !loading ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">
                      输入岗位 JD 或上传文件后点击“开始分析”，这里会显示结构化结果。
                    </div>
                  ) : null}

                  {loading ? (
                    <div className="rounded-3xl bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">
                      正在分析岗位需求与上传材料...
                    </div>
                  ) : null}

                  {result ? (
                    <div className="space-y-8">
                      <div className="grid gap-4 md:grid-cols-[1fr_190px]">
                        <div className="rounded-3xl bg-slate-50 p-5">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                            Job Keywords
                          </h3>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {Array.isArray(result.jobKeywords) &&
                            result.jobKeywords.length > 0 ? (
                              result.jobKeywords.map((keyword, index) => (
                                <span
                                  key={`${safeText(keyword)}-${index}`}
                                  className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200"
                                >
                                  {safeText(keyword)}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-slate-500">
                                暂无关键词
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl bg-slate-900 p-5 text-white">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                            Match Score
                          </h3>
                          <div className="mt-4 text-4xl font-bold">
                            {safeText(result.matchScore)}
                            <span className="text-xl text-slate-300">/100</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-6 2xl:grid-cols-2">
                        <div className="rounded-3xl bg-slate-50 p-5">
                          <h3 className="text-lg font-semibold">Gap Analysis</h3>
                          <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                            {Array.isArray(result.gapAnalysis) &&
                            result.gapAnalysis.length > 0 ? (
                              result.gapAnalysis.map((item, index) => (
                                <li
                                  key={`${safeText(item)}-${index}`}
                                  className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                                >
                                  {safeText(item)}
                                </li>
                              ))
                            ) : (
                              <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 text-slate-500">
                                暂无内容
                              </li>
                            )}
                          </ul>
                        </div>

                        <div className="rounded-3xl bg-slate-50 p-5">
                          <h3 className="text-lg font-semibold">
                            Improved Resume Bullets
                          </h3>
                          <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                            {Array.isArray(result.improvedBullets) &&
                            result.improvedBullets.length > 0 ? (
                              result.improvedBullets.map((item, index) => (
                                <li
                                  key={`${safeText(item)}-${index}`}
                                  className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                                >
                                  • {safeText(item)}
                                </li>
                              ))
                            ) : (
                              <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 text-slate-500">
                                暂无内容
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>

                      {result.error ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {result.error}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}

          <section
            ref={chatSectionRef}
            className={`flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm ${
              isFocusMode
                ? "h-[calc(100vh-16px)] border-slate-200/80 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"
                : "h-[calc(100vh-88px)]"
            }`}
          >
            <div
              className={`border-b border-slate-200 ${
                isFocusMode ? "px-6 py-4 md:px-8" : "px-7 py-5"
              }`}
            >
              <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div>
                  <h2
                    className={`font-semibold ${
                      isFocusMode ? "text-3xl" : "text-2xl"
                    }`}
                  >
                    AI 面试工作区
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    这里是主交互区。你可以自由提问，也可以切换到面试官模式进行更有节奏的模拟面试。
                  </p>

                  {uploadedFileName ? (
                    <div className="mt-3 inline-flex max-w-full items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                      已注入文件上下文：{uploadedFileName}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!showJdPanel ? (
                    <button
                      onClick={() => setShowJdPanel(true)}
                      className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      显示岗位信息
                    </button>
                  ) : null}

                  {!showResultPanel ? (
                    <button
                      onClick={() => setShowResultPanel(true)}
                      className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      显示分析结果
                    </button>
                  ) : null}

                  <button
                    onClick={() => setInterviewerMode((prev) => !prev)}
                    className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                      interviewerMode
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {interviewerMode ? "面试官模式已开启" : "开启面试官模式"}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleStartInterview}
                  disabled={chatLoading}
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  开始模拟面试
                </button>

                <button
                  onClick={handleGenerateSummary}
                  disabled={chatLoading || messages.length < 2}
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  生成总结报告
                </button>

                <button
                  onClick={handleResetChat}
                  disabled={chatLoading}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  清空对话
                </button>
              </div>
            </div>

            <div
              className={`flex-1 overflow-hidden bg-slate-50 ${
                isFocusMode ? "p-2 md:p-3" : "p-3"
              }`}
            >
              <div
                ref={chatContainerRef}
                className={`h-full overflow-y-auto rounded-3xl border border-slate-200 bg-white ${
                  isFocusMode ? "p-5 md:p-6" : "p-4"
                }`}
              >
                <div className="mx-auto max-w-5xl space-y-5">
                  {messages.map((message, index) => {
                    const isUser = message.role === "user";

                    return (
                      <div
                        key={`${message.role}-${index}`}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[92%] rounded-3xl px-5 py-4 text-sm leading-7 shadow-sm ${
                            isUser
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-slate-50 text-slate-800"
                          } ${isFocusMode ? "md:max-w-[78%]" : "md:max-w-[82%]"}`}
                        >
                          <div className="mb-1.5 text-xs font-medium opacity-70">
                            {isUser ? "你" : "AI 面试助手"}
                          </div>

                          {isUser ? (
                            <div className="whitespace-pre-wrap break-words text-sm leading-7">
                              {message.content}
                            </div>
                          ) : (
                            <AssistantMessage content={message.content} />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {chatLoading ? (
                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500 shadow-sm md:max-w-[82%]">
                        <div className="mb-1.5 text-xs font-medium opacity-70">
                          AI 面试助手
                        </div>
                        正在思考中...
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div
              className={`border-t border-slate-200 bg-white ${
                isFocusMode ? "p-3 md:p-4" : "p-4"
              }`}
            >
              <div
                className={`mx-auto ${
                  isFocusMode ? "max-w-5xl" : "max-w-5xl"
                } space-y-2`}
              >
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的问题，例如：请根据这个岗位开始一轮前端面试 / 我这样回答可以吗？"
                    className="max-h-[220px] min-h-[64px] flex-1 resize-none rounded-3xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-6 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
                  />

                  <button
                    onClick={handleSendMessage}
                    disabled={chatLoading || !chatInput.trim() || !hydrated}
                    className="inline-flex h-[64px] shrink-0 items-center justify-center rounded-2xl bg-slate-900 px-6 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {chatLoading ? "发送中..." : "发送"}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Enter 发送，Shift + Enter 换行
                  </p>
                  <p className="text-xs text-slate-400">
                    当前支持把上传文件内容一并注入对话上下文
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
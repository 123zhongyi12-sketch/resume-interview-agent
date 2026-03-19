import { NextRequest, NextResponse } from "next/server";

type InterviewQuestion = {
  question: string;
  intent: string;
  answerHint: string;
};

type AnalyzeResult = {
  jobKeywords: string[];
  matchScore: number;
  gapAnalysis: string[];
  improvedBullets: string[];
  interviewQuestions: InterviewQuestion[];
};

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function safeParseAnalyzeResult(rawText: string): AnalyzeResult {
  try {
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);

    return {
      jobKeywords: Array.isArray(parsed.jobKeywords)
        ? parsed.jobKeywords.map(String)
        : [],
      matchScore:
        typeof parsed.matchScore === "number"
          ? parsed.matchScore
          : Number(parsed.matchScore) || 0,
      gapAnalysis: Array.isArray(parsed.gapAnalysis)
        ? parsed.gapAnalysis.map(String)
        : [],
      improvedBullets: Array.isArray(parsed.improvedBullets)
        ? parsed.improvedBullets.map(String)
        : [],
      interviewQuestions: Array.isArray(parsed.interviewQuestions)
        ? parsed.interviewQuestions.map((item: unknown) => {
            const obj = item as Partial<InterviewQuestion>;
            return {
              question: String(obj.question || ""),
              intent: String(obj.intent || ""),
              answerHint: String(obj.answerHint || ""),
            };
          })
        : [],
    };
  } catch {
    return {
      jobKeywords: [],
      matchScore: 0,
      gapAnalysis: ["模型返回结果解析失败，请重试。"],
      improvedBullets: [],
      interviewQuestions: [],
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jobDescription = body.jobDescription as string | undefined;
    const uploadedText = body.uploadedText as string | undefined;
    const uploadedFileName = body.uploadedFileName as string | undefined;

    const hasJobDescription = Boolean(jobDescription?.trim());
    const hasUploadedText = Boolean(uploadedText?.trim());

    if (!hasJobDescription && !hasUploadedText) {
      return NextResponse.json(
        { error: "jobDescription 和上传文件内容不能同时为空" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelName =
      process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct";

    if (!apiKey) {
      return NextResponse.json(
        { error: "服务端缺少 OPENROUTER_API_KEY" },
        { status: 500 }
      );
    }

    const userContentParts: string[] = [];

    if (hasJobDescription) {
      userContentParts.push(
        `
【岗位 JD】
${jobDescription?.trim()}
        `.trim()
      );
    }

    if (hasUploadedText) {
      userContentParts.push(
        `
【用户上传文件内容】
文件名：${uploadedFileName || "unknown"}

以下内容来自用户上传的文件，可能是简历、项目说明、作品集、证书、成绩单或其他辅助材料。
请把它作为岗位匹配分析的重要依据之一。

${uploadedText?.trim()}
        `.trim()
      );
    }

    const messages = [
      {
        role: "system",
        content: `
你是一个专业的中文求职分析助手，专门帮助大学生、校招生和实习生分析岗位 JD，并输出结构化结果。

你的任务：
根据用户输入的岗位 JD，以及用户上传文件中提取出的内容，返回严格 JSON，字段如下：

{
  "jobKeywords": ["关键词1", "关键词2"],
  "matchScore": 0,
  "gapAnalysis": ["差距1", "差距2"],
  "improvedBullets": ["优化后的简历 bullet 1", "优化后的简历 bullet 2"],
  "interviewQuestions": [
    {
      "question": "面试问题",
      "intent": "考察意图",
      "answerHint": "回答提示"
    }
  ]
}

要求：
1. 必须只返回 JSON，不要添加额外解释。
2. 默认使用中文。
3. jobKeywords：提取 5-10 个岗位核心关键词。
4. matchScore：返回 0-100 的整数分数，表示候选人与岗位的大致匹配度。
5. gapAnalysis：输出 3-5 条候选人可能存在的能力差距。
6. improvedBullets：输出 3-5 条更适合该岗位的简历 bullet。
7. interviewQuestions：输出 3-5 道贴合岗位的面试题，每题包含 question / intent / answerHint。
8. 输出内容要适合学生/实习生，不要假设用户有多年工作经验。
9. 如果同时提供了 JD 和上传文件内容，要综合分析；如果只提供了其中一个，也要尽力输出有价值结果。
10. 不要编造上传文件中不存在的经历。
        `.trim(),
      },
      {
        role: "user",
        content: `
请分析以下内容，并严格返回 JSON：

${userContentParts.join("\n\n")}
        `.trim(),
      },
    ];

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature: 0.3,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter Analyze API Error:", data);
      return NextResponse.json(
        {
          error: data?.error?.message || "OpenRouter 调用失败",
          details: data,
        },
        { status: response.status }
      );
    }

    const rawText = data?.choices?.[0]?.message?.content?.trim() || "{}";
    const result = safeParseAnalyzeResult(rawText);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analyze API Error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
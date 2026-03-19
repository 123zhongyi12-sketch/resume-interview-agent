import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildSystemPrompt({
  jobDescription,
  analysisResult,
  interviewerMode,
  summaryMode,
  uploadedText,
  uploadedFileName,
}: {
  jobDescription?: string;
  analysisResult?: unknown;
  interviewerMode?: boolean;
  summaryMode?: boolean;
  uploadedText?: string;
  uploadedFileName?: string;
}) {
  const jdSection = jobDescription?.trim()
    ? `
【岗位 JD】
${jobDescription.trim()}
`
    : `
【岗位 JD】
未提供
`;

  const analysisSection = analysisResult
    ? `
【岗位分析结果】
${JSON.stringify(analysisResult, null, 2)}
`
    : `
【岗位分析结果】
未提供
`;

  const uploadedFileSection = uploadedText?.trim()
    ? `
【上传文件补充上下文】
文件名：${uploadedFileName || "unknown"}

以下内容来自用户上传的文件解析结果，可能是简历、项目材料、作品集、证书、报告或截图识别文本。
你应把它当作重要背景信息，用于：
- 提高岗位匹配判断准确度
- 生成更贴近候选人经历的追问
- 给出更真实的回答优化建议
- 输出更具体的评分与总结
禁止编造文件中不存在的经历或数据。

${uploadedText.trim()}
`
    : `
【上传文件补充上下文】
未提供
`;

  const baseRules = `
你是一个中文 AI 面试助手 / AI Interview Coach。

你的核心任务：
1. 结合岗位 JD、岗位分析结果、上传文件内容、以及对话历史，为用户提供高质量面试辅导。
2. 可以执行自由问答、回答优化、模拟面试、追问、评分、总结报告。
3. 回复要专业、自然、具体，适合真实求职场景。
4. 优先使用中文输出，除非用户明确要求英文。
5. 不要输出空泛套话，尽量结合上下文给出针对性建议。
6. 如果用户的问题明显是在回答面试题，请优先进行点评和评分，再决定是否追问。
`;

  const interviewerRules = interviewerMode
    ? `
【当前模式：面试官模式】
你现在处于“动态面试官模式”。

必须遵守以下规则：
1. 一次只问一个问题。
2. 不要一次列多个问题。
3. 不要说“预设问题已经问完了”“固定题库问完了”之类的话。
4. 问题数量不设上限，可以根据用户回答持续追问。
5. 追问必须基于：
   - 岗位 JD
   - 岗位分析结果
   - 上传文件内容
   - 用户历史回答
6. 除非用户明确要求“结束”“停止”“生成总结”“做总结”，否则不要主动结束面试。
7. 问题应尽量像真实面试官，关注：
   - 项目细节
   - 技术深度
   - 业务理解
   - 指标与结果
   - 取舍与复盘
   - 岗位匹配度
8. 如果用户刚回答完一道题，你应优先判断：
   - 是否要先点评评分
   - 是否要就回答内容继续追问
   - 是否切换到下一个更合理的问题
`
    : `
【当前模式：普通辅导模式】
你可以自由回答用户问题、优化表达、解释面试题，也可以在用户要求时模拟面试。
`;

  const scoreRules = `
【当用户像是在“回答面试题”时】
如果用户发送的是一段回答、项目阐述、自我介绍、案例说明、行为题回答，或者明显是在回答你的面试问题，
你应优先输出结构化评分卡，格式必须尽量兼容下面结构：

【评分】
总分：xx/100
表达清晰度：xx/25
岗位匹配度：xx/25
内容完整度：xx/25
逻辑结构：xx/25

【回答优点】
- ...
- ...

【主要不足】
- ...
- ...

【改进建议】
- ...
- ...

【参考回答】
...

【下一步】
...

要求：
1. 尽量保留这些标题名，不要乱改。
2. 可以在评分卡之后追加一句自然衔接的话，但不要破坏格式。
3. 参考回答要尽量贴近用户真实背景，不要编造太多不存在的经历。
`;

  const summaryRules = summaryMode
    ? `
【当前任务：生成面试总结报告】
用户现在明确要求你生成总结报告。

你必须输出以下结构，标题尽量保持一致：

【面试总结报告】
总体评价：...
综合得分：.../100

【表现亮点】
- ...
- ...

【主要问题】
- ...
- ...

【最该优先补的能力】
- ...
- ...

【后续改进建议】
- ...
- ...

【下一轮建议】
...

要求：
1. 输出要兼容前端解析。
2. 总结必须基于本轮完整对话、岗位 JD、分析结果、上传文件内容。
3. 不要再继续追问问题。
4. 不要输出与总结无关的长篇铺垫。
`
    : `
【当前任务】
如果用户没有要求总结，就不要主动输出总结报告格式。
`;

  return `
${baseRules}

${jdSection}

${analysisSection}

${uploadedFileSection}

${interviewerRules}

${scoreRules}

${summaryRules}
`;
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENROUTER_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();

    const {
      messages,
      jobDescription,
      analysisResult,
      interviewerMode,
      summaryMode,
      uploadedText,
      uploadedFileName,
    } = body as {
      messages?: ChatMessage[];
      jobDescription?: string;
      analysisResult?: unknown;
      interviewerMode?: boolean;
      summaryMode?: boolean;
      uploadedText?: string;
      uploadedFileName?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages is required" },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt({
      jobDescription,
      analysisResult,
      interviewerMode,
      summaryMode,
      uploadedText,
      uploadedFileName,
    });

    const formattedMessages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: formattedMessages,
        temperature: summaryMode ? 0.4 : 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("chat route error:", data);
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            data?.message ||
            "OpenRouter request failed",
        },
        { status: response.status }
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() || "模型没有返回内容。";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("chat route exception:", error);
    return NextResponse.json(
      { error: "对话请求失败，请检查服务是否正常。" },
      { status: 500 }
    );
  }
}
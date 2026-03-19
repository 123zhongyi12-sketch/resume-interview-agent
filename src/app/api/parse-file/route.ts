import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import mammoth from "mammoth";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL || "qwen/qwen2.5-vl-72b-instruct";

function getMimeCategory(type: string) {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (
    type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "text/csv"
  ) {
    return "text";
  }
  return "unknown";
}

async function extractTextFromPdf(buffer: Buffer) {
  try {
    const data = await pdf(buffer);
    return data.text?.trim() || "";
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown PDF parse error";

    console.error("PDF parse failed:", message);

    throw new Error(
      "该 PDF 解析失败。这个文件可能是扫描版、损坏、或由某些工具生成的非标准 PDF。建议改传 DOCX、TXT，或把 PDF 重新导出后再试。"
    );
  }
}

async function extractTextFromImage(file: File) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const mimeType = file.type || "image/png";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract useful structured text from uploaded images for career analysis. " +
            "If this is a resume, OCR and preserve important details like name, summary, skills, projects, experience, metrics, education. " +
            "If this is not a resume, summarize the visible content faithfully. " +
            "Do not invent missing content.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Please extract the visible text and return a clean plain-text version. " +
                "If it looks like a resume, organize it into sections.",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Vision parse failed: ${errorText}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const fileType = file.type;
    const category = getMimeCategory(fileType);
    const buffer = Buffer.from(await file.arrayBuffer());

    let extractedText = "";
    let warning = "";

    if (category === "pdf") {
      extractedText = await extractTextFromPdf(buffer);
    } else if (category === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value?.trim() || "";

      if (result.messages?.length) {
        warning = result.messages
          .map((m: { message: string }) => m.message)
          .join("; ");
      }
    } else if (category === "text") {
      extractedText = buffer.toString("utf-8").trim();
    } else if (category === "image") {
      extractedText = await extractTextFromImage(file);
    } else if (
      fileType === "application/msword" ||
      file.name.toLowerCase().endsWith(".doc")
    ) {
      return NextResponse.json(
        {
          error:
            "Legacy .doc is not directly supported yet. Please convert it to .docx or PDF.",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${fileType || file.name}`,
        },
        { status: 400 }
      );
    }

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            "Could not extract useful text from this file. If this is a scanned PDF, try uploading it as images or convert it to DOCX/TXT.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileType,
      extractedText,
      warning,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to parse file";

    console.error("parse-file error:", error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
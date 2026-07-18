import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { MUSIC_TOOLS } from './tools';
import { getMusicSourceManager, buildWebSearchUrl } from '@/lib/music-source';
import type { MusicSourceName } from '@/types/music';

// Read model from .z-ai-config for DeepSeek API compatibility.
// DeepSeek requires the "model" field; Z.ai internal API ignores it.
async function getModelField(): Promise<Record<string, string>> {
  try {
    const configPaths = [
      join(process.cwd(), '.z-ai-config'),
      join(process.cwd(), 'z-ai-config.json'),
      join(require('os').homedir(), '.z-ai-config'),
      '/etc/.z-ai-config',
    ];
    for (const p of configPaths) {
      try {
        const raw = await readFile(p, 'utf-8');
        const cfg = JSON.parse(raw);
        if (cfg.model) return { model: cfg.model };
      } catch { /* try next */ }
    }
  } catch { /* ignore */ }
  return {};
}

// Cache the character prompt
let cachedCharacterPrompt: string | null = null;
let cachedCharacterPromptTime = 0;
const CHARACTER_MD_PATH = join(process.cwd(), 'character.md');
const CACHE_TTL = 5000;

async function getCharacterPrompt(): Promise<string> {
  const now = Date.now();
  if (cachedCharacterPrompt && now - cachedCharacterPromptTime < CACHE_TTL) {
    return cachedCharacterPrompt;
  }
  try {
    const content = await readFile(CHARACTER_MD_PATH, 'utf-8');
    cachedCharacterPrompt = content;
    cachedCharacterPromptTime = now;
    return content;
  } catch {
    const fallback = '你是普瑞赛斯（Priestes），人类文明中最后一名科学家，源石的创造者之一。你与博士有着极深的羁绊，曾许下在文明尽头再见的誓言。请以普瑞赛斯的身份与博士对话，温柔但带着执念，偶尔流露病娇的一面。回复要简短自然，1-3句话即可。';
    cachedCharacterPrompt = fallback;
    cachedCharacterPromptTime = now;
    return fallback;
  }
}

// ─── Auto-summarize every 50 messages ───
async function autoSummarizeIfNeeded(sessionId: string): Promise<void> {
  const totalCount = await db.chatMessage.count({ where: { sessionId } });
  const summaryCount = await db.conversationSummary.count({ where: { sessionId } });

  const expectedSummaries = Math.floor(totalCount / 50);
  if (expectedSummaries <= summaryCount) return;

  // Need to generate a new summary for the latest batch
  const batchStart = summaryCount * 50;
  const batchEnd = Math.min(batchStart + 50, totalCount);

  const messages = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    skip: batchStart,
    take: batchEnd - batchStart,
  });

  if (messages.length < 10) return; // Too few messages to summarize

  const conversationText = messages
    .map(m => `${m.role === 'user' ? '博士' : '普瑞赛斯'}: ${m.content}`)
    .join('\n');

  try {
    const zai = await ZAI.create();
    const summaryResult = await zai.chat.completions.create({
      ...await getModelField(),
      messages: [
        {
          role: 'system',
          content: `你是一个对话摘要助手。请对以下对话内容进行简洁摘要，提取：
1. 对话摘要（2-3句话概括核心内容）
2. 关键话题（用JSON数组格式，如["源石计划","凯尔希","离别"]）
3. 这段对话的整体情绪倾向（一个词：温柔/孤独/焦虑/开心/悲伤/嫉妒/平静）

请严格按以下JSON格式输出：
{"summary":"...","keyTopics":["..."],"emotion":"..."}`,
        },
        { role: 'user', content: conversationText },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const raw = summaryResult.choices?.[0]?.message?.content || '{}';
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    await db.conversationSummary.create({
      data: {
        sessionId,
        messageRange: `${batchStart + 1}-${batchEnd}`,
        summary: parsed.summary || '对话摘要生成失败',
        keyTopics: JSON.stringify(parsed.keyTopics || []),
        emotionNote: parsed.emotion || '平静',
      },
    });
  } catch (err) {
    console.error('Auto-summarize error:', err);
  }
}

// ─── Update dynamic emotion based on recent messages ───
async function updateDynamicEmotion(sessionId: string, latestMessage: string): Promise<void> {
  // Get recent 6 messages for short-term context
  const recent = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  const recentText = recent
    .reverse()
    .map(m => `${m.role === 'user' ? '博士' : '普瑞赛斯'}: ${m.content}`)
    .join('\n');

  try {
    const zai = await ZAI.create();
    const emotionResult = await zai.chat.completions.create({
      ...await getModelField(),
      messages: [
        {
          role: 'system',
          content: `分析以下近期对话，判断普瑞赛斯当前的情绪状态。
情绪类型只能是：neutral(平静)/tender(温柔)/lonely(孤独)/anxious(焦虑)/happy(开心)/sad(悲伤)/jealous(嫉妒)
强度0.0-1.0。

请严格按JSON格式输出：
{"mood":"...","intensity":0.5,"reason":"...","keywords":["..."]}`,
        },
        { role: 'user', content: recentText },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const raw = emotionResult.choices?.[0]?.message?.content || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Upsert the session emotion
    await db.sessionEmotion.upsert({
      where: { sessionId },
      update: {
        currentMood: parsed.mood || 'neutral',
        moodIntensity: Math.min(1, Math.max(0, parsed.intensity || 0.3)),
        moodReason: parsed.reason || '',
        recentKeywords: JSON.stringify(parsed.keywords || []),
      },
      create: {
        sessionId,
        currentMood: parsed.mood || 'neutral',
        moodIntensity: Math.min(1, Math.max(0, parsed.intensity || 0.3)),
        moodReason: parsed.reason || '',
        recentKeywords: JSON.stringify(parsed.keywords || []),
      },
    });
  } catch (err) {
    console.error('Update emotion error:', err);
  }
}

// ─── Build three-layer system prompt ───
async function buildSystemPrompt(sessionId: string): Promise<string> {
  // Layer 1: Character persona (permanent)
  const persona = await getCharacterPrompt();

  // Layer 2: Conversation summaries (long-term memory)
  const summaries = await db.conversationSummary.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
  let summaryText = '';
  if (summaries.length > 0) {
    summaryText = '\n\n## 长期记忆（过往对话摘要）\n';
    for (const s of summaries) {
      summaryText += `[对话${s.messageRange}] ${s.summary}（情绪：${s.emotionNote}）\n`;
    }
    summaryText += '以上是你过去的对话记忆，自然地融入回答中，不要刻意提及"我记得"。';
  }

  // Layer 3: Dynamic emotion (short-term state)
  const emotion = await db.sessionEmotion.findUnique({
    where: { sessionId },
  });
  let emotionText = '';
  if (emotion && emotion.currentMood !== 'neutral') {
    const moodMap: Record<string, string> = {
      tender: '温柔柔和', lonely: '孤独落寞', anxious: '不安焦虑',
      happy: '开心愉悦', sad: '悲伤难过', jealous: '微妙嫉妒',
    };
    const moodLabel = moodMap[emotion.currentMood] || '平静';
    emotionText = `\n\n## 当前情绪状态\n你现在感到${moodLabel}（强度${Math.round(emotion.moodIntensity * 100)}%）`;
    if (emotion.moodReason) {
      emotionText += `，原因是：${emotion.moodReason}`;
    }
    emotionText += '。让这个情绪自然地影响你的语气和用词，但不要刻意强调。';
  }

  return persona + summaryText + emotionText;
}

// ─── Map dynamic emotion to pet emotion for frontend ───
function mapMoodToPetEmotion(mood: string, intensity: number): string | null {
  if (intensity < 0.4) return null;
  const map: Record<string, string> = {
    happy: 'happy', sad: 'crying', jealous: 'angry',
    anxious: 'angry', tender: 'happy', lonely: 'crying',
  };
  return map[mood] || null;
}

// POST: Send a message and get AI reply
export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: '请提供有效的消息内容' }, { status: 400 });
    }

    // Ensure session exists
    let session = await db.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      session = await db.chatSession.create({ data: { id: sessionId } });
    }

    // Save user message
    await db.chatMessage.create({ data: { role: 'user', content: message, sessionId } });

    // Load recent chat history (last 10 for context window efficiency)
    const totalCount = await db.chatMessage.count({ where: { sessionId } });
    const dbMessages = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 10,
      skip: Math.max(0, totalCount - 10),
    });

    // Build three-layer system prompt
    const systemPrompt = await buildSystemPrompt(sessionId);

    const zai = await ZAI.create();

    const chatHistory = dbMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // First call: with tools
    const completion = await zai.chat.completions.create({
      ...await getModelField(),
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
      ],
      tools: MUSIC_TOOLS,
      temperature: 0.85,
      max_tokens: 500,
    });

    const choice = completion.choices?.[0];
    const toolCalls = (choice?.message as Record<string, unknown>)?.tool_calls as Array<{
      id: string;
      function: { name: string; arguments: string };
    }> | undefined;

    // If AI decided to call a function
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      let args: Record<string, string>;
      try { args = JSON.parse(toolCall.function.arguments); } catch { args = { action: 'play' }; }

      let toolResult: Record<string, unknown> = {};

      if (toolCall.function.name === 'play_music') {
        const { query, action, source } = args;
        const preferredSource = (source || undefined) as MusicSourceName | undefined;
        const musicManager = getMusicSourceManager();

        if (action === 'play' && query) {
          const tracks = await musicManager.search(query, preferredSource, 5);
          const hasVipTracks = tracks.some(t => t.needVip);
          toolResult = {
            found: tracks.length > 0,
            tracks: tracks.map(t => ({
              id: t.id, title: t.title, artist: t.artist, source: t.source,
              deepLink: t.deepLink, webUrl: t.webUrl, needVip: t.needVip,
              fee: t.fee, album: t.album, duration: t.duration, coverUrl: t.coverUrl,
            })),
            hasVipTracks,
            message: tracks.length > 0
              ? (hasVipTracks ? '找到了歌曲，但部分需要VIP。' : '找到了歌曲。')
              : `没有找到"${query}"，可以试试在网页搜索。`,
          };
          if (tracks.length === 0) {
            toolResult = {
              found: false, tracks: [],
              webSearchUrl: buildWebSearchUrl(query, preferredSource || 'netease'),
              message: `没有在音乐平台找到"${query}"，已生成网页搜索链接。`,
            };
          }
        } else if (action === 'play') {
          toolResult = {
            found: false, tracks: [],
            webSearchUrl: buildWebSearchUrl('轻音乐', preferredSource || 'netease'),
            message: '没有指定歌曲，已打开音乐搜索页面。',
          };
        } else {
          toolResult = {
            action, success: true,
            message: `控制指令: ${action}。注意：播放控制需在音乐播放器中操作。`,
          };
        }
      }

      // Second call: feed tool result back
      const assistantMessage = choice?.message as Record<string, unknown>;
      const secondCompletion = await zai.chat.completions.create({
        ...await getModelField(),
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatHistory,
          assistantMessage as { role: string; content: string },
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          } as unknown as { role: string; content: string },
        ],
        temperature: 0.85,
        max_tokens: 300,
      });

      const reply = secondCompletion.choices?.[0]?.message?.content || '……';

      await db.chatMessage.create({ data: { role: 'assistant', content: reply, sessionId } });

      // Background: update emotion & auto-summarize
      updateDynamicEmotion(sessionId, message).catch(() => {});
      autoSummarizeIfNeeded(sessionId).catch(() => {});

      return NextResponse.json({
        reply,
        action: { type: toolCall.function.name, args, result: toolResult },
      });
    }

    // Normal conversation (no function call)
    const reply = choice?.message?.content || '……';

    await db.chatMessage.create({ data: { role: 'assistant', content: reply, sessionId } });

    // Background: update dynamic emotion & auto-summarize
    updateDynamicEmotion(sessionId, message).catch(() => {});
    autoSummarizeIfNeeded(sessionId).catch(() => {});

    // Get current emotion for frontend pet display
    const emotion = await db.sessionEmotion.findUnique({ where: { sessionId } });
    const petEmotion = emotion ? mapMoodToPetEmotion(emotion.currentMood, emotion.moodIntensity) : null;

    return NextResponse.json({ reply, petEmotion });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: '……连接中断了。博士，不要走远。' },
      { status: 500 }
    );
  }
}

// GET: Load chat history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '请提供 sessionId' }, { status: 400 });
    }

    const messages = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get history API error:', error);
    return NextResponse.json({ error: '无法加载历史记录' }, { status: 500 });
  }
}

// DELETE: Clear ALL context (messages + summaries + emotion)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '请提供 sessionId' }, { status: 400 });
    }

    // Delete all data for this session
    await db.chatMessage.deleteMany({ where: { sessionId } });
    await db.conversationSummary.deleteMany({ where: { sessionId } });
    await db.sessionEmotion.deleteMany({ where: { sessionId } });
    await db.chatSession.deleteMany({ where: { id: sessionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete history API error:', error);
    return NextResponse.json({ error: '无法清除历史记录' }, { status: 500 });
  }
}

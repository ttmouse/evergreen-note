import { showError } from '@/slate-item/utils/msg/showSnack'
import { trim } from '@/slate-item/utils/string/trim'

export type MessageFormat = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type DeltaParams = {
  joined: string
  paragraph: string
  token: string
  isBreak: boolean
  isStop: boolean
}

export type ChatGPTParams = {
  apiUrl?: String
  messages: MessageFormat[]
  model?: string
  stream?: boolean
  user?: string
  onDelta?: (delta: DeltaParams) => void
  onCompleted?: (data: { paragraphs: string }) => void
  apiKey: string
}

// API key is supplied by the user via chatParams (never hard-code credentials).

export async function createChatCompletion(chatParams: ChatGPTParams) {
  try {
    const { onDelta, onCompleted, apiKey, apiUrl, model, ...params } = chatParams
    const response = await fetch((apiUrl as unknown as URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        stream: true,
        ...params,
      }),
    })

    if (!response.ok) {
      // Handle non-2xx HTTP status codes
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After')) || 5
        showError(
          `AI assistant: you have exceeded the rate limit for the OpenAI GPT API`
        )
        // await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        // return createChatCompletion(chatParams) // Retry the request
      } else if (response.status === 400) {
        showError(
          'AI assistant: Bad request. Invalid syntax or client-side error.'
        )
      } else if (response.status === 401) {
        showError('AI assistant: Unauthorized. Authentication required.')
      } else if (response.status === 403) {
        showError(
          'AI assistant: Forbidden. Insufficient permissions to access the resource.'
        )
      } else if (response.status === 404) {
        showError(
          'AI assistant: Not found. The requested resource could not be found.'
        )
      } else if (response.status === 500) {
        showError(
          'AI assistant: Internal Server Error. Unexpected server-side error.'
        )
      } else {
        showError(
          `AI assistant error: ${response.status} ${response.statusText}`
        )
      }

      return
    }

    if (!response?.body) {
      return
    }
    const reader = response.body.getReader()
    let result = ''
    let paragraph = ''
    let lastData = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        onCompleted?.({ paragraphs: result })
        break
      }
      const rawStr = new TextDecoder().decode(value)
      for (const splited of rawStr.split('data:')) {
        const spt = lastData + splited.trim()
        const reg = spt.match(/\{.+\}/)
        if (reg) {
          let data;
          try {
            data = JSON.parse(reg[0])
            lastData = ''
          } catch {
            lastData = spt;
            continue;
          }
          const token = data.choices[0].delta?.content ?? ''
          let isBreak = token?.endsWith('\n')
          if (paragraph.endsWith('\n')) {
            if (
              !paragraph.startsWith('```') ||
              /^```(.+?)```\n$/ms.test(paragraph)
            ) {
              paragraph = ''
            }
          }
          result += token
          paragraph += token

          // 处理代码块的逻辑
          let tmpParagraph = paragraph
          if (paragraph.startsWith('```')) {
            isBreak = /^```(.+?)```\n$/ms.test(paragraph)
            if (!isBreak) {
              // eslint-disable-next-line operator-assignment, prefer-template
              tmpParagraph = tmpParagraph.replace(/\n`+$/, '') + '\n```\n'
            }
          }
          onDelta?.({
            token,
            joined: result,
            paragraph: tmpParagraph,
            isBreak,
            isStop: data.choices[0].finished_reason === 'stop',
          })
        } else {
          const trimmed = spt.trim();
          if (trimmed) lastData = trimmed;
        }
      }
    }
    return trim(result)
  } catch (err: any) {
    console.error('AI assistant error:', err)
    const msg =
      err.message === 'Failed to fetch'
        ? `Failed to connect AI service, please check your network.`
        : err.message
    showError(`AI assistant error: ${msg}`)
  }
}

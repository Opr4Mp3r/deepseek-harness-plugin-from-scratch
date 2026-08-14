import {
  CallId,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

const RULE = 'Keep public APIs documented.'

function toolCallResponse(): StreamChunk[] {
  const call = {
    type: 'tool-call' as const,
    id: CallId('remember-rule'),
    name: 'remember_project_rule',
    arguments: JSON.stringify({ rule: RULE }),
  }
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: call },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function textResponse(): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Rule received.' },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'text', text: 'Rule received.' },
    },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

export class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.requests.length === 1
      ? toolCallResponse()
      : textResponse()
    for (const chunk of chunks) yield chunk
  }
}

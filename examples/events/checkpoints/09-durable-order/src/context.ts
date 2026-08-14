import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'

export function createProjectRuleContext(rule: string): UserMessage {
  return createUserMessage({
    content: [{
      type: 'text',
      text: `Project rule for the rest of this session:\n${rule}`,
    }],
    source: { kind: 'plugin', plugin: 'durable-project-rule' },
  })
}

import { describe, expect, it } from 'vitest'
import { buildClaudePrompt, parseClaudeAnswer } from './claudeImport'

const answer = {
  summary: 'Le cours présente la loi de Hooke.',
  key_points: ['σ = E × ε', '  '],
  sections: [{ title: 'Élasticité', content: 'Un matériau élastique reprend sa forme.' }],
  glossary: [{ term: 'Module de Young', definition: 'Rigidité du matériau.' }],
  questions: [
    {
      kind: 'qcm',
      difficulty: 'facile',
      prompt: 'Unité du module de Young ?',
      choices: ['Pa', 'N', 'm', 'kg'],
      correct_choice: 0,
      answer: 'Pa',
      explanation: 'Une contrainte divisée par une déformation sans unité.',
    },
    { kind: 'vrai_faux', difficulty: 'moyen', prompt: 'ε a une unité.', choices: [], correct_choice: -1, answer: 'Faux', explanation: '' },
    { kind: 'qcm', difficulty: 'facile', prompt: 'QCM cassé', choices: ['A'], correct_choice: 3, answer: 'A', explanation: '' },
    { kind: 'inconnu', prompt: 'Type inconnu', answer: 'x' },
  ],
}

describe('parseClaudeAnswer', () => {
  it('lit le JSON même entouré de texte et de ```json', () => {
    const text = `Voici l'analyse :\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\`\nBonne révision !`
    const result = parseClaudeAnswer(text)
    expect(result.summary).toBe('Le cours présente la loi de Hooke.')
    expect(result.key_points).toEqual(['σ = E × ε'])
    expect(result.sections).toHaveLength(1)
    expect(result.glossary[0].term).toBe('Module de Young')
  })

  it('garde les questions valides et écarte les autres', () => {
    const { questions } = parseClaudeAnswer(JSON.stringify(answer))
    expect(questions.map((q) => q.kind)).toEqual(['qcm', 'vrai_faux'])
    expect(questions[0]).toMatchObject({ choices: ['Pa', 'N', 'm', 'kg'], correct_choice: 0 })
    expect(questions[1]).toMatchObject({ choices: null, correct_choice: null })
  })

  it('explique le problème si le texte n’est pas du JSON', () => {
    expect(() => parseClaudeAnswer('Bonjour !')).toThrow(/pas de JSON/)
    expect(() => parseClaudeAnswer('{ "summary": "coupé…')).toThrow(/pas de JSON|incomplète/)
    expect(() => parseClaudeAnswer('{ "summary": "x", "questions": [] }')).toThrow(/aucune question/)
  })
})

describe('buildClaudePrompt', () => {
  it('demande le bon nombre de questions et un JSON', () => {
    const prompt = buildClaudePrompt(16)
    expect(prompt).toContain('exactement 16 questions')
    expect(prompt).toContain('UNIQUEMENT avec un objet JSON')
  })
})

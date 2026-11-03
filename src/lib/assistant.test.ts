import { describe, expect, it } from 'vitest'
import {
  correctionHelpQuestion,
  effortLabel,
  MAX_QUESTION_LENGTH,
  questionToFlashcard,
  sectionHelpQuestion,
} from './assistant'
import { cleanText } from './extractText'
import type { Question } from './types'

const base: Question = {
  id: 'q1',
  document_id: 'd1',
  position: 0,
  kind: 'courte',
  difficulty: 'facile',
  prompt: 'Quelle est la capitale du Cameroun ?',
  choices: null,
  correct_choice: null,
  answer: 'Yaoundé',
  explanation: 'Douala est la plus grande ville, mais la capitale est Yaoundé.',
  added_to_flashcards: false,
}

describe('questionToFlashcard', () => {
  it('met la question au recto et la réponse expliquée au verso', () => {
    expect(questionToFlashcard(base)).toEqual({
      front: 'Quelle est la capitale du Cameroun ?',
      back: 'Yaoundé\n\nDouala est la plus grande ville, mais la capitale est Yaoundé.',
    })
  })

  it('liste les propositions d’un QCM avec des lettres', () => {
    const card = questionToFlashcard({
      ...base,
      kind: 'qcm',
      prompt: 'Combien font 2 × 3 ?',
      choices: ['5', '6', '8', '9'],
      correct_choice: 1,
      answer: '6',
      explanation: '2 × 3 = 6.',
    })
    expect(card.front).toBe('Combien font 2 × 3 ?\n\nA. 5\nB. 6\nC. 8\nD. 9')
    expect(card.back).toBe('B. 6\n\n2 × 3 = 6.')
  })

  it('précise « Vrai ou faux » au recto', () => {
    const card = questionToFlashcard({ ...base, kind: 'vrai_faux', prompt: 'La Terre est plate.', answer: 'Faux' })
    expect(card.front).toBe('Vrai ou faux ? La Terre est plate.')
  })
})

describe('questions préparées pour l’IA', () => {
  it('cite la partie de l’explication', () => {
    expect(sectionHelpQuestion('La torsion')).toContain('« La torsion »')
  })

  it('cite l’énoncé et la réponse du corrigé', () => {
    const text = correctionHelpQuestion(base)
    expect(text).toContain(base.prompt)
    expect(text).toContain('Yaoundé')
  })

  it('reste sous la limite d’une question, même avec un très long corrigé', () => {
    const long = 'x'.repeat(5000)
    expect(correctionHelpQuestion({ ...base, prompt: long, answer: long }).length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH)
    expect(sectionHelpQuestion(long).length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH)
  })
})

describe('effortLabel', () => {
  it('nomme chaque niveau de réflexion, « Équilibrée » par défaut', () => {
    expect(effortLabel('low')).toBe('Rapide')
    expect(effortLabel('high')).toBe('Approfondie')
    expect(effortLabel(null)).toBe('Équilibrée')
  })
})

describe('cleanText', () => {
  it('supprime les espaces et lignes vides en trop', () => {
    expect(cleanText('  Titre  \r\n\r\n\r\n\r\nUn   texte\t avec  espaces \n')).toBe('Titre\n\nUn texte avec espaces')
  })
})

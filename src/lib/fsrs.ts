const FSRS_PARAMS = {
  w: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.533,
    0.1544, 1.007, 1.9395, 0.11, 0.29, 2.27, 0.25, 2.9898,
  ],
  requestRetention: 0.9,
  maximumInterval: 36500,
} as const

export type Rating = 1 | 2 | 3 | 4
export type CardState = 0 | 1 | 2 | 3

export interface FSRSCard {
  stability: number
  difficulty: number
  reps: number
  lapses: number
  state: CardState
  dueDate: Date
}

export interface FSRSResult {
  card: FSRSCard
  scheduledDays: number
  interval: number
}

const DECAY = -0.5
const FACTOR = 19 / 81
const INITIAL_STABILITY: Record<Rating, number> = {
  1: 0.5,
  2: 1,
  3: 3,
  4: 5,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundDays(value: number) {
  return Math.max(1, Math.round(value))
}

function toDate(value: Date) {
  return new Date(value.getTime())
}

function addDays(baseDate: Date, days: number) {
  const nextDate = new Date(baseDate.getTime())
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function intervalFromStability(stability: number, requestRetention = FSRS_PARAMS.requestRetention) {
  const safeStability = Math.max(0.1, stability)
  const numerator = Math.pow(requestRetention, 1 / DECAY) - 1
  const interval = (safeStability / FACTOR) * numerator
  return clamp(interval, 1, FSRS_PARAMS.maximumInterval)
}

function nextDifficulty(currentDifficulty: number, rating: Rating) {
  const deltaMap: Record<Rating, number> = {
    1: 1.2,
    2: 0.5,
    3: -0.2,
    4: -0.6,
  }

  return clamp(currentDifficulty + deltaMap[rating], 1, 10)
}

function initialDifficulty(rating: Rating) {
  return clamp(6 + (3 - rating) * 0.9, 1, 10)
}

function normalizeCard(card: FSRSCard): FSRSCard {
  return {
    ...card,
    stability: Math.max(card.stability || 0, 0),
    difficulty: clamp(card.difficulty || 5, 1, 10),
    dueDate: toDate(card.dueDate),
  }
}

export function predictRetention(card: FSRSCard, days: number): number {
  const safeStability = Math.max(card.stability, 0.1)
  const safeDays = Math.max(days, 0)
  return Math.pow(1 + FACTOR * (safeDays / safeStability), DECAY)
}

export function getDueCards<T extends FSRSCard>(cards: T[]): T[] {
  const now = Date.now()
  return cards
    .filter((card) => new Date(card.dueDate).getTime() <= now)
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
}

export function scheduleCard(card: FSRSCard, rating: Rating, reviewDate = new Date()): FSRSResult {
  const normalizedCard = normalizeCard(card)
  const reviewAt = toDate(reviewDate)
  const dueDate = normalizedCard.dueDate
  const overdueDays = Math.max(0, Math.floor((reviewAt.getTime() - dueDate.getTime()) / 86_400_000))

  // TODO: upgrade this fallback scheduler to a full FSRS-4.5 implementation.
  // This keeps the Phase 4 UI/API contract stable while using a simplified
  // FSRS-shaped stability/difficulty model when full parameter training is absent.
  if (normalizedCard.reps === 0 || normalizedCard.state === 0) {
    const stability = INITIAL_STABILITY[rating]
    const difficulty = initialDifficulty(rating)
    const interval = rating === 1 ? 1 : roundDays(intervalFromStability(stability))
    const nextState: CardState = rating === 1 || rating === 2 ? 1 : 2

    return {
      scheduledDays: interval,
      interval,
      card: {
        stability,
        difficulty,
        reps: 1,
        lapses: rating === 1 ? 1 : 0,
        state: nextState,
        dueDate: addDays(reviewAt, interval),
      },
    }
  }

  const elapsedDays = Math.max(1, Math.round(normalizedCard.stability) + overdueDays)
  const retention = predictRetention(normalizedCard, elapsedDays)
  const difficulty = nextDifficulty(normalizedCard.difficulty, rating)

  if (rating === 1) {
    const relearnStability = clamp(normalizedCard.stability * (0.4 + (1 - retention) * 0.3), 0.5, 10)
    const interval = 1

    return {
      scheduledDays: interval,
      interval,
      card: {
        stability: relearnStability,
        difficulty,
        reps: normalizedCard.reps + 1,
        lapses: normalizedCard.lapses + 1,
        state: 3,
        dueDate: addDays(reviewAt, interval),
      },
    }
  }

  const growthFactorMap: Record<Exclude<Rating, 1>, number> = {
    2: 1.2 + (1 - retention) * 0.5,
    3: 1.9 + (1 - retention) * 0.9,
    4: 2.4 + (1 - retention) * 1.2,
  }
  const nextStability = clamp(
    normalizedCard.stability * growthFactorMap[rating] * (11 - difficulty) / 7,
    0.5,
    FSRS_PARAMS.maximumInterval,
  )

  const ratingMultiplierMap: Record<Exclude<Rating, 1>, number> = {
    2: 0.8,
    3: 1,
    4: 1.2,
  }
  const interval = roundDays(intervalFromStability(nextStability) * ratingMultiplierMap[rating])

  return {
    scheduledDays: interval,
    interval,
    card: {
      stability: nextStability,
      difficulty,
      reps: normalizedCard.reps + 1,
      lapses: normalizedCard.lapses,
      state: 2,
      dueDate: addDays(reviewAt, interval),
    },
  }
}

export function estimateNextIntervals(card: FSRSCard, reviewDate = new Date()) {
  return {
    again: scheduleCard(card, 1, reviewDate).interval,
    hard: scheduleCard(card, 2, reviewDate).interval,
    good: scheduleCard(card, 3, reviewDate).interval,
    easy: scheduleCard(card, 4, reviewDate).interval,
  }
}

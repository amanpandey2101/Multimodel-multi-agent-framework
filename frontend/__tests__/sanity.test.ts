import { render, screen } from '@testing-library/react'

describe('White Box Test: Sample Suite', () => {
  it('should pass a basic sanity check', () => {
    expect(1 + 1).toBe(2)
  })

  it('should demonstrate logic testing', () => {
    const calculateProgress = (completed, total) => (completed / total) * 100
    expect(calculateProgress(1, 4)).toBe(25)
    expect(calculateProgress(2, 2)).toBe(100)
  })
})

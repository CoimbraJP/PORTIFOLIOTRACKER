import { describe, expect, it } from 'vitest'
import { money } from '../../money/decimal'
import { accruedInterest, estimateAccrued, readAccrualFields } from '../accrual'

const start = new Date('2024-01-01T12:00:00Z')

describe('estimateAccrued', () => {
  it('devolve o principal quando a avaliação é na data de início', () => {
    const value = estimateAccrued({
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY',
      startDate: start,
      asOf: start,
    })

    expect(value.toFixed(2)).toBe('10000.00')
  })

  it('não rende para trás quando a data de avaliação é anterior ao início', () => {
    const value = estimateAccrued({
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY',
      startDate: start,
      asOf: new Date('2023-06-01T12:00:00Z'),
    })

    expect(value.toFixed(2)).toBe('10000.00')
  })

  it('capitaliza 1% a.m. em 30 dias', () => {
    const value = estimateAccrued({
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY',
      startDate: start,
      asOf: new Date('2024-01-31T12:00:00Z'),
    })

    expect(value.toFixed(2)).toBe('10100.00')
  })

  it('capitaliza de forma COMPOSTA em 12 meses, não linear', () => {
    const value = estimateAccrued({
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY',
      startDate: start,
      asOf: new Date('2024-12-26T12:00:00Z'), // 360 dias
    })

    // Simples daria 11.200. Composto dá 1,01^12 = 1,126825…
    expect(value.toFixed(2)).toBe('11268.25')
    expect(Number(value.toFixed(2))).toBeGreaterThan(11200)
  })

  it('rende proporcional aos dias, sem pular de zero para um mês inteiro', () => {
    const quinze = estimateAccrued({
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY',
      startDate: start,
      asOf: new Date('2024-01-16T12:00:00Z'),
    })

    const trinta = estimateAccrued({
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY',
      startDate: start,
      asOf: new Date('2024-01-31T12:00:00Z'),
    })

    expect(Number(quinze.toFixed(2))).toBeGreaterThan(10000)
    expect(Number(quinze.toFixed(2))).toBeLessThan(Number(trinta.toFixed(2)))
  })

  it('aceita taxa ao ano', () => {
    const value = estimateAccrued({
      principal: money(10000),
      rate: money(12),
      period: 'YEARLY',
      startDate: start,
      asOf: new Date('2024-12-31T12:00:00Z'), // 365 dias
    })

    expect(value.toFixed(2)).toBe('11200.00')
  })

  it('accruedInterest devolve só os juros', () => {
    const args = {
      principal: money(10000),
      rate: money(1),
      period: 'MONTHLY' as const,
      startDate: start,
      asOf: new Date('2024-01-31T12:00:00Z'),
    }

    expect(accruedInterest(args).toFixed(2)).toBe('100.00')
  })
})

describe('readAccrualFields', () => {
  it('lê taxa e data do custom_fields', () => {
    const parsed = readAccrualFields({ rate: '1,5', startDate: '2024-03-10' })

    expect(parsed).not.toBeNull()
    expect(parsed!.rate.toString()).toBe('1.5')
    expect(parsed!.period).toBe('MONTHLY')
  })

  it('devolve null sem taxa — não inventa rendimento', () => {
    expect(readAccrualFields({ startDate: '2024-03-10' })).toBeNull()
    expect(readAccrualFields({ rate: '', startDate: '2024-03-10' })).toBeNull()
  })

  it('devolve null sem data válida', () => {
    expect(readAccrualFields({ rate: '1' })).toBeNull()
    expect(readAccrualFields({ rate: '1', startDate: '10/03/2024' })).toBeNull()
  })

  it('devolve null com taxa zero ou negativa', () => {
    expect(readAccrualFields({ rate: '0', startDate: '2024-03-10' })).toBeNull()
    expect(readAccrualFields({ rate: '-2', startDate: '2024-03-10' })).toBeNull()
  })
})

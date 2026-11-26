import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedList, validateCardPayload, validateScorePayload } from '../src/validation.js';

const valid = {
  sessionId: '123e4567-e89b-42d3-a456-426614174000',
  turnstileToken: 'token',
  name: '테스터',
  score: 1234,
  timeSec: 75.126,
  char: 2,
  diff: 'normal'
};

test('정상 점수 요청을 정규화한다', () => {
  const result = validateScorePayload(valid);
  assert.equal(result.ok, true);
  assert.equal(result.value.timeSec, 75.13);
  assert.equal(result.value.name, '테스터');
});

test('알 수 없는 필드를 거부한다', () => {
  assert.equal(validateScorePayload({ ...valid, admin: true }).ok, false);
});

test('범위를 벗어난 점수와 시간을 거부한다', () => {
  assert.equal(validateScorePayload({ ...valid, score: 20001 }).ok, false);
  assert.equal(validateScorePayload({ ...valid, timeSec: 19.99 }).ok, false);
  assert.equal(validateScorePayload({ ...valid, timeSec: Number.NaN }).ok, false);
});

test('긴 이름과 제어문자를 거부한다', () => {
  assert.equal(validateScorePayload({ ...valid, name: '12345678901' }).ok, false);
  assert.equal(validateScorePayload({ ...valid, name: 'abc\n' }).ok, false);
});

test('허용 목록은 공백과 빈 값을 제거한다', () => {
  assert.deepEqual([...parseAllowedList(' https://a.example,https://b.example, ')], [
    'https://a.example',
    'https://b.example'
  ]);
});

const card = {
  turnstileToken: 'token',
  name: '디자이너리',
  message: '메리 크리스마스!\n올해도 모두 수고 많았어요.',
  theme: 'cream',
  stamp: 'tree'
};

test('정상 카드 요청을 통과시키고 공백을 정리한다', () => {
  const result = validateCardPayload({ ...card, name: '  혜련  ', message: '  안녕하세요  ' });
  assert.equal(result.ok, true);
  assert.equal(result.value.name, '혜련');
  assert.equal(result.value.message, '안녕하세요');
  assert.equal(result.value.theme, 'cream');
  assert.equal(result.value.stamp, 'tree');
});

test('카드 길이 제한을 지킨다', () => {
  assert.equal(validateCardPayload({ ...card, name: '1234567890123' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: 'a'.repeat(141) }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: '   ' }).ok, false);
  assert.equal(validateCardPayload({ ...card, name: '' }).ok, false);
});

test('카드에서 괄호·링크·연락처·긴 숫자를 막는다', () => {
  assert.equal(validateCardPayload({ ...card, message: '<script>alert(1)</script>' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: 'https://evil.example' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: 'www.evil.example' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: '메일 abc@abc.com' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: '01012345678' }).ok, false);
});

test('카드에서 비속어·광고성 문구를 막는다', () => {
  assert.equal(validateCardPayload({ ...card, message: '카지노 오세요' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: '대출 상담 환영' }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: 'a'.repeat(12) }).ok, false);
});

test('카드 종이와 우표는 정해진 값만 허용한다', () => {
  assert.equal(validateCardPayload({ ...card, theme: 'gold' }).ok, false);
  assert.equal(validateCardPayload({ ...card, stamp: 'heart' }).ok, false);
  assert.equal(validateCardPayload({ ...card, theme: 'ruby', stamp: 'santa' }).ok, true);
});

test('카드의 알 수 없는 필드와 제어문자를 거부한다', () => {
  assert.equal(validateCardPayload({ ...card, admin: true }).ok, false);
  assert.equal(validateCardPayload({ ...card, message: 'abc\u0007def' }).ok, false);
  assert.equal(validateCardPayload({ ...card, turnstileToken: '' }).ok, false);
});

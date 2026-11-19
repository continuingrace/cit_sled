import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedList, validateScorePayload } from '../src/validation.js';

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

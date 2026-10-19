import assert from 'node:assert/strict';
import test from 'node:test';
import {nameplateClass, wideNameplate} from './nameplate.ts';

test('names of up to seven ems keep the fixed plate', () => {
  for (const name of ['实验室', '克洛斯星草原', '塞西利亚星冰面', '虚幻的地下城市']) assert.equal(wideNameplate(name), false, name);
});

test('longer names take the stretching plate', () => {
  assert.equal(wideNameplate('时空通道场景-暮色之城'), true);
  assert.equal(wideNameplate('勇者之塔 · 第 1 层'), true);
});

test('ASCII counts half an em and every other character a full em', () => {
  assert.equal(wideNameplate('塞西利亚星冰-1'), false, 'six ems and two ASCII characters');
  assert.equal(wideNameplate('塞西利亚星冰-12'), true, 'six ems and three ASCII characters');
  assert.equal(wideNameplate('塞西利亚星冰·1'), true, 'the middle dot is not ASCII');
});

test('only a wide name adds the stretching plate class', () => {
  assert.equal(nameplateClass('塞西利亚星冰面'), 'world-location-hud');
  assert.equal(nameplateClass('时空通道场景-暮色之城'), 'world-location-hud world-location-hud-wide');
});

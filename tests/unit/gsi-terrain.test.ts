import {describe,it,expect} from 'vitest';
import {gsiToTerrain,hasCachedTerrain} from '../../src/gsiTerrain';
const elevation=(v:[number,number,number])=>-10000+(v[0]*65536+v[1]*256+v[2])*0.1;
describe('GSI signed centimetre DEM conversion',()=>{
 it('preserves positive and negative land elevations within 0.05 m',()=>{
  expect(elevation(gsiToTerrain(0,0,123))).toBeCloseTo(1.2,6);
  expect(elevation(gsiToTerrain(255,255,156))).toBeCloseTo(-1,6);
 });
 it('treats the official no-data code as a display-only sea plane',()=>{
  expect(elevation(gsiToTerrain(128,0,0))).toBe(0);
 });
 it('uses cached terrain only for covered Kamijima tiles',()=>{
  expect(hasCachedTerrain(8,222,101)).toBe(true);
  expect(hasCachedTerrain(8,200,101)).toBe(false);
  expect(hasCachedTerrain(7,111,51)).toBe(false);
 });
});

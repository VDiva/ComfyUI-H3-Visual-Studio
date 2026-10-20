import assert from 'node:assert/strict';
import {formatSpeed,formatEta} from '../web/model-download.mjs';
assert.equal(formatSpeed(2*1048576),'2.00 MiB/s');assert.equal(formatSpeed(1024),'1.0 KiB/s');assert.equal(formatSpeed(0),'0 B/s');assert.equal(formatEta(null),'估算中');assert.equal(formatEta(61),'1分1秒');assert.equal(formatEta(3661),'1小时1分');console.log('PASS speed units and remaining time display');

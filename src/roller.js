const { randomInt } = require('node:crypto');

const MAX_ROLL_POINTS = 1_000_000;
const MAX_TOTAL_POINTS = 2 ** 48 - 1;

function totalRollPoints(prizes) {
  return prizes.reduce((total, prize) => {
    if (!Number.isSafeInteger(prize.points) || prize.points < 1 || prize.points > MAX_ROLL_POINTS) {
      throw new Error('Every prize must have a valid points value.');
    }
    const nextTotal = total + prize.points;
    if (nextTotal > MAX_TOTAL_POINTS) {
      throw new Error('The combined roller points are too large to roll safely.');
    }
    return nextTotal;
  }, 0);
}

function getRollChancePercent(points, totalPoints) {
  if (!Number.isSafeInteger(points) || points < 1 ||
      !Number.isSafeInteger(totalPoints) || totalPoints < points) {
    throw new Error('A valid prize points total is required to calculate its chance.');
  }
  return points / totalPoints * 100;
}

function selectRollPrize(prizes, draw = randomInt) {
  if (prizes.length === 0) throw new Error('There are no prizes configured for this roller yet.');

  const totalPoints = totalRollPoints(prizes);
  const selectedPoint = draw(totalPoints);
  if (!Number.isInteger(selectedPoint) || selectedPoint < 0 || selectedPoint >= totalPoints) {
    throw new Error('The roller could not select a valid prize.');
  }

  let pointBoundary = 0;
  for (const prize of prizes) {
    pointBoundary += prize.points;
    if (selectedPoint < pointBoundary) return prize;
  }

  throw new Error('The roller could not select a prize.');
}

module.exports = {
  MAX_ROLL_POINTS,
  getRollChancePercent,
  selectRollPrize,
  totalRollPoints
};

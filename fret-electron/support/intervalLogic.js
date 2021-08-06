// *****************************************************************************
// Notices:
//
// Copyright © 2019, 2021 United States Government as represented by the Administrator
// of the National Aeronautics and Space Administration. All Rights Reserved.
//
// Disclaimers
//
// No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF
// ANY KIND, EITHER EXPRESSED, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT LIMITED
// TO, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL CONFORM TO SPECIFICATIONS,
// ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
// OR FREEDOM FROM INFRINGEMENT, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE
// ERROR FREE, OR ANY WARRANTY THAT DOCUMENTATION, IF PROVIDED, WILL CONFORM TO
// THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, IN ANY MANNER, CONSTITUTE AN
// ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT OF ANY RESULTS,
// RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY OTHER APPLICATIONS
// RESULTING FROM USE OF THE SUBJECT SOFTWARE.  FURTHER, GOVERNMENT AGENCY
// DISCLAIMS ALL WARRANTIES AND LIABILITIES REGARDING THIRD-PARTY SOFTWARE, IF
// PRESENT IN THE ORIGINAL SOFTWARE, AND DISTRIBUTES IT ''AS IS.''
//
// Waiver and Indemnity:  RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS AGAINST
// THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS
// ANY PRIOR RECIPIENT.  IF RECIPIENT'S USE OF THE SUBJECT SOFTWARE RESULTS IN
// ANY LIABILITIES, DEMANDS, DAMAGES, EXPENSES OR LOSSES ARISING FROM SUCH USE,
// INCLUDING ANY DAMAGES FROM PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S
// USE OF THE SUBJECT SOFTWARE, RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE
// UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY
// PRIOR RECIPIENT, TO THE EXTENT PERMITTED BY LAW.  RECIPIENT'S SOLE REMEDY FOR
// ANY SUCH MATTER SHALL BE THE IMMEDIATE, UNILATERAL TERMINATION OF THIS
// AGREEMENT.
// *****************************************************************************
// Implements relationships on intervals that have left and right bounds

const infty = 1000;
const neginfty = -1000;

function makeInterval (l,r) {
    return ({left: l, right: r});
}

exports.emptyInterval = () => {
    return makeInterval(infty,neginfty);
}

exports.length = (interval) => {
  return (interval.right - interval.left)
}

exports.isWellFormed = (interval) => {
  return (interval.left <= interval.right)
}

exports.createInterval = (l, r) => {
    var interval = makeInterval(l,r);
    if (! this.isWellFormed(interval)) interval = this.emptyInterval();
    return interval;
}

exports.createMaxInterval = () => {
  return(makeInterval(0, infty))
}

exports.includesW = (interval1, interval2) => {
  return ((interval1.left <= interval2.left) && (interval1.right >= interval2.right))
}

exports.includesS = (interval1, interval2) => {
  return ((interval1.left < interval2.left) && (interval1.right > interval2.right))
}

exports.equals = (interval1, interval2) => {
  return ((interval1.left == interval2.left) && (interval1.right == interval2.right))
}

exports.beforeW = (interval1, interval2) => {
  return (interval1.right <= interval2.left)
}

exports.beforeS = (interval1, interval2) => {
  return (interval1.right < interval2.left)
}

exports.afterW = (interval1, interval2) => {
  return (interval1.left >= interval2.right)
}

exports.afterS = (interval1, interval2) => {
  return (interval1.left > interval2.right)
}

exports.disjoint = (interval1, interval2) => {
  return (this.beforeS(interval1, interval2) || this.beforeS(interval2, interval1))
}

exports.startsBeforeW = (interval1, interval2) => {
    return (interval1.left <= interval2.left)
}

exports.startsAfter = (interval1, interval2, n=0) => {
    return (interval1.left == interval2.right+n+1)
}

exports.leftCoincides = (interval1, interval2) => {
    return (interval1.left == interval2.left)
}

exports.rightCoincides = (interval1, interval2) => {
    return (interval1.right == interval2.right)
}

exports.includesPoint = (interval, point) => {
  return ((interval.left <= point) && (point <= interval.right))
}

exports.includesPointMultiple = (intervals, point) => {
    return intervals.some((interval) => this.includesPoint(interval,point));
}

// interval1 minus interval2
// interval1 minus empty interval makes interval1
// returns array of intervals, possibly empty
exports.minus = (interval1, interval2) => {
    result = [];
    al = interval1.left; ar = interval1.right;
    bl = interval2.left; br = interval2.right;
    left  = this.createInterval(al,Math.min(ar,bl-1));
    right = this.createInterval(Math.max(br+1,al),ar);
    if (this.isWellFormed(left)) result.push(left);
    if (this.isWellFormed(right) && !this.equals(left,right)) result.push(right);
    return result;
}

// Given two arrays, each of disjoint intervals, this subtracts the second from the first
// resulting in an array of intervals, possibly empty.
exports.minusMultiple = (intervals1, intervals2) => {
    if (intervals1.length === 0) return [];
    if (intervals1.length === 1 && intervals2.length === 1)
	return this.minus(intervals1[0],intervals2[0]);
    var result = [];
    for (let interval1 of intervals1) {
	var remainder = [interval1];
	for (let interval2 of intervals2) {
	    remainder = this.minusMultiple(remainder, [interval2]);
	}
	result = result.concat(remainder);
    }
    return result;
}

// Does intervalsBig contain intervalsSmall?
exports.contains = (intervalsBig, intervalsSmall) =>
    { return this.minusMultiple(intervalsSmall, intervalsBig).length == 0; }

// Returns an array that is empty if no intersection, and otherwise
// an array of a single interval.
exports.intersect = (interval1, interval2) => {
     al = interval1.left; ar = interval1.right;
     bl = interval2.left; br = interval2.right;
     c = this.createInterval(Math.max(al,bl),Math.min(ar,br));
    return (this.isWellFormed(c)) ? [c] : []
    }

exports.intersectMultiple = (intervals1, intervals2) => {
    if (intervals1.length === 0) return [];
    if (intervals1.length === 1 && intervals2.length === 1)
	return this.intersect(intervals1[0],intervals2[0]);
    var result = [];
    for (let interval1 of intervals1) {
	for (let interval2 of intervals2) {
	    var intersection = this.intersect(interval1,interval2);
	    result = result.concat(intersection)
	}
    }
    return result;
}

// Whether some interval i in intervals is not disjoint with interval
exports.overlaps = (intervals, interval) =>
    intervals.some((i) => !this.disjoint(i,interval))

// Whether some interval in intervals2 overlaps with some interval in intervals1.
exports.overlapsMultiple = (intervals1, intervals2) =>
   intervals2.some((i) => this.overlaps(intervals1,i))

exports.intervalToString = (interval) =>
    ('[' + interval.left + ',' + interval.right + ']')

exports.intervalsToString = (intervals) => 
    ('[' + intervals.map((i) => this.intervalToString(i)).join(',') + ']');

exports.intervalToPair = (interval) => {
    return [interval.left,interval.right];
}

exports.intervalsToArray = (intervals) => {
    return intervals.map(this.intervalToPair);
}

exports.print = (interval, name) => {
  console.log(name + this.intervalToString(interval))
}

exports.printMultiple = (intervals, name) => {
  console.log(name + ": " + this.intervalsToString(intervals));
}

exports.memberS = (interval, point) => {
  return ((interval.left < point) && (interval.right > point))
}

exports.memberW = (interval, point) => {
  return ((interval.left <= point) && (interval.right >= point))
}

// Is the array of intervals equal to []?
exports.isEmpty = (intervals) => {
    return (intervals.length === 0);
}

exports.removeEmptyIntervals = (intervals) => {
  return intervals.filter(this.isWellFormed)
}

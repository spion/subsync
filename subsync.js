#!/usr/bin/env node

var argv = require('optimist').
    demand(1).
    usage([
           "usage: $0 <spec> [spec, ...] < input.srt > output.srt", 
           "  where <spec> is <position>+<shift> or <position>-<shift>",
           "    position can be hh:mm:ss or @",
           "    shift is a number in seconds.",
           "  subsync will shift the subtitles at the specified position by the specified amount in seconds",
           "",
           "  example: $0 @+1 @+20 - start shifting by 1s at the beginning, and end with +20 seconds at the end",
           "  example: $0 @+0 1:00:00-4 - Start shifting by 0s at the beginning, gradually decrease to -4s at 1 hour and hold it there."].join('\n')).
   argv;

function parseTime(str) {
    var elems = str.replace(',','.').split(':').map(parseFloat);
    return elems[0] * 3600 + elems[1] * 60 + elems[2];
}

function stringifyTime(t) {
    var h = Math.floor(t/3600);
    var m = Math.floor((t - h * 3600) / 60);
    var s = (t - h * 3600 - m * 60).toFixed(3);
    return [h,m,s].map(padz).join(':').replace('.',',');
}

function parseSpec(spec) {
    var positive = ~spec.indexOf('+');
    var timepos = spec.split(/[-+]/);
    var t = parseTime(timepos[0]),
        shift = parseFloat(timepos[1]);
    if (!positive) shift = 0 - shift;
    return { at: t, shift: shift };
}

function padz(n) { return n >= 10 ? n : '0'+n; }

function createShifter(specs) { 
    return function(pos) {
       for (var k = 1; specs[k].at < pos; ++k);
       var start = specs[k-1], end = specs[k];
       var percent = (pos - start.at) / (end.at - start.at)
       var shift = start.shift + percent * (end.shift - start.shift);
       return pos + shift;
    }
}


var sub = [];
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', function(d) {
    sub.push(d);
});


process.stdin.on('end', function() {
    var lines = sub.join('').split(/\r*\n/);
    var subs = [];

    var expect = 'new', last;
    lines.forEach(function(l) {
        if (expect == 'new') { last = {id: parseInt(l), text:''}; expect = 'time'; }
        else if (expect == 'time') { 
            var twoTimes = l.split(/\s+-+>\s+/);
            last.start = parseTime(twoTimes[0]);
            last.end = parseTime(twoTimes[1]);
            expect = 'text_end';
        }
        else {
            if (l.match(/^\s*$/)) { 
                last.text += '\r\n'; 
                subs.push(last); 
                expect = 'new'; 
            }
            else last.text += l + '\r\n';
        }
    });


    var maxat = subs.reduce(function(acc, el) { return acc > el.end ? acc : el.end; }, 0);

    var specs = argv._.map(parseSpec);

    specs.unshift({at: -1, shift: specs[0].shift});
    specs.push({at: maxat + 1, shift: specs[specs.length - 1].shift});

    specs = specs.filter(function(spec) { return !isNaN(spec.at); });
    specs = specs.sort(function(a, b) { return a.at - b.at; });

    var shifter = createShifter(specs);

    subs.forEach(function(sub) {
        sub.start = shifter(sub.start);
        sub.end = shifter(sub.end);
    })

    subs.map(function(sub) {
        return [sub.id, '\r\n', stringifyTime(sub.start), ' --> ', stringifyTime(sub.end), '\r\n', sub.text, '\r\n'].join('')
    }).forEach(function(str) {
        process.stdout.write(str);
    });
    
});

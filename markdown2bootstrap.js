#!/usr/bin/env node
/*jshint node:true, es5:true */
const _ = require('underscore');
const assert = require('assert');
var argv = require('optimist').
        usage('Usage: $0 [options] <doc.md ...>').
        demand(1).
        boolean('n').
        describe('n', 'Turn off numbered sections').
        boolean('h').
        describe('h', 'Turn on bootstrap page header.').
        describe('outputdir', 'Directory to put the converted files in.').
        default('outputdir', '.').
        describe('nav', 'JSON file of nav bar').
        default('nav', null).
        argv,
    pagedown = require('pagedown'),
    converter = new pagedown.Converter(),
    path = require('path'),
    fs = require('fs'),
    top_part = fs.readFileSync(__dirname + "/parts/top.html").toString(),
    bottom_part = fs.readFileSync(__dirname + "/parts/bottom.html").toString(),
    levels, toc, nextId;
var nav = null;
if (argv.nav) {
  nav = require(argv.nav);
}

function findTag(md, tag, obj, parse) {
    var re = new RegExp("^<!-- " + tag + ": (.+) -->", "m");
    var matches = _.chain(md.split("\n")).
      map(function(x) {
        return x.match(re);
      }).
      filter(function(x) {return x;}).
      value();

    if (!obj) { return; }

    if (matches.length > 0) {
      if (parse) {
        _.map(matches, function(match) {
          obj[tag] = obj[tag].concat(JSON.parse(match[1]));
        });
      } else {
        obj[tag] = matches[0][1];
      }
    }
}

function getTag(tag, close = false) {
  return function(items) {
    assert(_.isArray(items));
    return _.map(items, function(item) {
      var result = "<" + tag;
      _.forEach(item, function(v, k) {
        if (v) {
          assert(_.isString(v));
          result += ' ' + k + '="' + v + '"';
        } else {
          result += ' ' + k;
        }
      });
      result += ">";
      if (close) result += "</" + tag + ">";
      if (close) {
        if (result === "<" + tag + "></" + tag + ">") result = "";
      } else {
        if (result === "<" + tag + ">") result = "";
      }
      return result;
    }).
    join("\n");
  };
}

var getMeta = getTag("meta"), getLink = getTag("link"), getScript = getTag("script", true);

// Configure section and toc generation
converter.hooks.set("postConversion", function(text) {
    return text.replace(/<(h(\d))>/g, function(match, p1, p2, offset, str) {
        var i, levelStr = "";

        levels[p1] = levels[p1] || 0;

        // Figure out section number
	if (!argv.n) {
            // reset lower levels
            for (i = Number(p2) + 1; levels["h"+i]; i++) {
                levels["h"+i] = 0;
            }

            // grab higher levels
            for (i = Number(p2) - 1; levels["h"+i]; i--) {
                levelStr = levels["h"+i] + "." + levelStr;
            }

            levels[p1] = levels[p1] + 1;
            levelStr = levelStr + levels[p1] + ". ";
        }

        // Add toc entry
        toc.push({
            levelStr: levelStr,
            id: ++nextId,
            title: str.slice(offset+4, str.slice(offset).indexOf("</h")+offset)
        });

        return "<h" + p2 + ' id="' + nextId + '">' + levelStr;
    }).
    replace(/<pre>/g, '<pre class="prettyprint">').
    replace(/".*mailto%3a(.*)"/, function(match, p1) {
        return "\"mailto:" + p1  + "\"";
    });
});

// Create output directory
argv.outputdir = path.resolve(process.cwd(), argv.outputdir);
if (!fs.existsSync(argv.outputdir)) {
    fs.mkdirSync(argv.outputdir);
}

argv._.forEach(function(md_path) {
    var tags = {
      title: "TITLE HERE",
      subtitle: "SUBTITLE HERE" ,
      "header-title": "HEADER TITLE HERE",
      icon: "ICON HERE",
      "scripts" : [],
      "header-meta" : [],
      "header-link" : []
    },
        md, output, tocHtml = "",
        output_path = path.join(argv.outputdir, path.basename(md_path));

    // Determine output filename
    if (/\.md$/.test(output_path)) {
        output_path = output_path.slice(0, -3);
    }
    output_path += '.html';

    // Read markdown in
    md = fs.readFileSync(md_path).toString();

    // Find title and subtitle tags in document
    findTag(md, "title", tags);
    findTag(md, "subtitle", tags);
    findTag(md, "header-title", tags);
    findTag(md, "icon", tags);
    findTag(md, "scripts", tags, true);
    findTag(md, "header-meta", tags, true);
    findTag(md, "header-link", tags, true);

    levels = {}; nextId = 0; toc = [];
    output = converter.makeHtml(md);
    // Add table of contents
    // tocHtml += '<div class="span3 bs-docs-sidebar"><ul class="nav nav-list bs-docs-sidenav" data-spy="affix">';
    tocHtml += '<div class="span3 bs-docs-sidebar"><ul id="affix-toc" class="nav nav-list bs-docs-sidenav">';
    toc.forEach(function(entry) {
      tocHtml += '<li><a href="#' + entry.id + '">' + entry.levelStr + entry.title + '</a></li>';
      var re = new RegExp('<a href="#' + entry.title + '">' + entry.title + '</a>', 'g');
      output = output.replace(re, '<a href="#' + entry.id + '">' + entry.title + '</a>');
    });
    tocHtml += '</ul></div><div class="span9">';

    // nav
    var nav_part = "";
    if (nav) {
      nav_part = '<div class="container"><ul class="nav nav-tabs">';
      current_k = output_path.substring(output_path.lastIndexOf('/')+1);
      nav_part += _.map(nav, function(v, k) {
        if (current_k === v) {
          return '<li class="active"><a href="#"><h5>' + k + '</h5></a></li>';
        } else {
          return '<li><a href="' + v + '"><h5 style="color: #0088cc;">' + k + '</h5></a></li>';
        }
      }).join("");
      nav_part += '</ul></div>';
    }
    // Bootstrap-fy
    output =
        top_part.replace(/\{\{header\}\}/, function() {
            if (argv.h) {
                return '<header class="jumbotron subhead" id="overview">' +
                       '<div class="container">' +
                       '<h1>' + tags.title  + '</h1>' +
                       '<p class="lead">' + tags.subtitle + '</p>' +
                       '</div></header>';
            } else {
                return "";
            }
        }).
        replace(/\{\{header-meta\}\}/, tags["header-meta"].length > 0 ? getMeta(tags["header-meta"]) : "").
        replace(/\{\{header-link\}\}/, tags["header-link"].length > 0 ? getLink(tags["header-link"]) : "").
        replace(/\{\{title\}\}/, tags["header-title"] === "TITLE HERE" ? "" : tags["header-title"]).
        replace(/\{\{icon\}\}/, tags["icon"] === "ICON HERE" ? "" : tags["icon"]) +

        nav_part +
        tocHtml +
        output +
        bottom_part.
          replace(/\{\{scripts\}\}/, tags["scripts"].length > 0 ? getScript(tags["scripts"]) : "");

    fs.writeFileSync(output_path, output);
    console.log(output);
    console.log("Converted " + md_path + " to " + path.relative(process.cwd(), output_path));
});

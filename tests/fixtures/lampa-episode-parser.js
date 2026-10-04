'use strict';
// Native EpisodeParser.parse excerpt from https://lampac.fun/lampa-main/app.min.js?v=1990073.
// Retrieved 2026-10-04. Source SHA256:
// 86AD907734B7AB20C65FEF607B890DE752577F77F61E5FE92FC37507314484EE.
// The fixture preserves native season/episode/hash_string semantics; tests prefix
// hash_string instead of loading the full UI bundle solely for Utils.hash.
  function parse$c(data) {
    var result = {
      hash_string: '',
      season: null,
      episode: null,
      serial: !!data.movie.number_of_seasons
    };
    var regexps = [[/\bs(\d+)\.?ep?(\d+)\b/i, 'season', 'episode'], [/\b(\d{1,2})[x\-](\d+)\b/i, 'season', 'episode'], [/\bs(\d{2})(\d{2,3})\b/i, 'season', 'episode'], [/season (\d+) episode (\d+)/i, 'season', 'episode'], [/сезон (\d+) серия (\d+)/i, 'season', 'episode'], [/(\d+) season (\d+) episode/i, 'season', 'episode'], [/(\d+) сезон (\d+) серия/i, 'season', 'episode'], [/episode (\d+)/i, 'episode'], [/серия (\d+)/i, 'episode'], [/(\d+) episode/i, 'episode'], [/(\d+) серия/i, 'episode'], [/season (\d+)/i, 'season'], [/сезон (\d+)/i, 'season'], [/(\d+) season/i, 'season'], [/(\d+) сезон/i, 'season'], [/\bs(\d+)\b/i, 'season'], [/\bep?\.?(\d+)\b/i, 'episode'], [/\b(\d{1,3}) of (\d+)/i, 'episode'], [/\b(\d{1,3}) из (\d+)/i, 'episode'], [/ - (\d{1,3})\b/i, 'episode'], [/\[(\d{1,3})\]/i, 'episode'], [/(\d+) сер/i, 'episode']];
    var folder_regexps = [[/season (\d+)/i, 'season'], [/сезон (\d+)/i, 'season'], [/(\d+) season/i, 'season'], [/(\d+) сезон/i, 'season'], [/\bs(\d+)\b/i, 'season']];
    var parts = data.path.replace(/_/g, ' ').split('/');
    var fname = parts.pop();
    var folder = parts.pop();
    regexps.forEach(function (regexp) {
      var match = fname.match(regexp[0]);

      if (match) {
        var arr = regexp.slice(1);
        arr.forEach(function (a, i) {
          var v = match[i + 1];
          if (v && result[a] == null) result[a] = parseInt(v);
        });
      }
    });

    if (folder && result.season == null) {
      folder_regexps.forEach(function (regexp) {
        var match = folder.match(regexp[0]);

        if (match) {
          var arr = regexp.slice(1);
          arr.forEach(function (a, i) {
            var v = match[i + 1];
            if (v && result[a] == null) result[a] = parseInt(v);
          });
        }
      });
    }

    if (result.season == null) result.season = data.movie.number_of_seasons ? 1 : 0;

    if (result.episode == null) {
      var match = data.filename.replace(/_/g, ' ').trim().match(/^(\d{1,3})\b/i);
      result.episode = match ? parseInt(match[1]) : 0;
    }

    if (!data.is_file) {
      if (data.movie.number_of_seasons) {
        result.hash_string = [result.season, result.season > 10 ? ':' : '', result.episode, data.movie.original_title].join('');
      } else if (data.movie.original_title && !result.serial) {
        result.hash_string = data.movie.original_title;
      } else {
        result.hash_string = data.path;
      }
    } else {
      result.hash_string = data.path;
    }

    return result;
  }


module.exports = parse$c;

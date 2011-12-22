(function () {
  var root = (typeof exports !== "undefined" && exports) || this,
      Jack = root.Jack || (root.Jack = {}),
      Booleans, Keywords, Tokens, embedder;

  Booleans = [
    "true", "false",
    "on",   "off",
    "yes",  "no",
    "ok"
  ];

  Keywords = [
    "def", "return", "if", "else", "unless", "end", "for", "in"
  ];

  Tokens = {
    ID: /^([a-z_$][a-z0-9_$]*)\b/i,
    WS: /^([ \t]+)/,
    COMMENT: /^(#.*)\n/,
    NEWLINE: /^([ \t]*\n)/,
    NUMBER: /^(0x[0-9a-f]+|-?(0|[1-9][0-9]*)(\.[0-9]+)?(e[+\-]?[0-9]+)?)\b/i,
    STRING: /^('(\\.|[^'])*')/,
    INTERPOL: /^(([a-z$_][a-z0-9$_]*)?"(\/.|[^"])*")/i,
    STRING_HEREDOC: /^('''\n(?:[^']|'[^']|''[^']|\\')*\n[ \t]*''')/,
    INTERPOL_HEREDOC: /^(([a-z$_][a-z0-9$_]*)?"""\n(?:[^"]|"[^"]|""[^"]|\\")*\n[ \t]*""")/i,
    REGEX: /^(\/(?:\\\/|[^\/])*\/[img]*)/,
    CODE: /^([\[\]\{\},=\.])/,
    ADDOP: /^([+\-])/,
    OP: /^(([*\/%]|<<|>>|>>>))/,
    LOGOP: /^((&&|\|\||&|\||\^))/,
    RELOP: /^((in|instanceof))/,
    COMPOP: /^((==|!=|<|>|<=|>=))/,
    ARROW: /^(:[ \t]*)/,
    LPAREN: /^([ \t]*\()/,
    RPAREN: /^(\)[ \t]*)/
  };


  // Used to find embedded code in interpolated strings.
  embedder = /\$(?:([a-z$_][a-z0-9$_]*)|\{([^}]*)\})/i;

  // Turn a raw heredoc code capture into a raw string value.
  function strip_heredoc(value) {
    var indent;
    value = value.substr(4, value.length - 7);
    indent = value.match(/\n([ \t]*)$/)[1];
    value = value.substr(0, value.length - indent.length - 1);
    return value.split("\n").map(function (line) {
      return line.substr(indent.length);
    }).join("\n");
  }

  // Split interpolated strings into an array of literals and code fragments.
  function split_interpol(value) {
    var items = [],
        pos = 0,
        next = 0,
        match;
    while (true) {
      // Match up to embedded string
      next = value.substr(pos).search(embedder);
      if (next < 0) {
        if (pos < value.length) {
          items.push(value.substr(pos));
        }
        break;
      }
      items.push(value.substr(pos, next));
      pos += next;

      // Match embedded string
      match = value.substr(pos).match(embedder);
      next = match[0].length;
      if (next < 0) { break; }
      items.push(match[1] || match[2]);
      pos += next;
    }
    return items;
  }

  // Take the raw token stream and clean it up a bit.
  function analyse(tokens) {
    var last, name;
    return tokens.map(function (token) {
      var index, value;
      last = name;
      value = token.value;
      name = token.name;
      switch (name) {
        case "NEWLINE":
          if (last === "NEWLINE") {
            return false;
          }
          break;
        case "CODE":
          token.name = token.value.trim();
          delete token.value;
          break;
        case "STRING":
          try {
            token.value = JSON.parse(value);
          } catch(e) {
          }
          break;
        case "STRING_HEREDOC":
          token.name = "STRING";
          token.value = strip_heredoc(value);
          break;
        case "INTERPOL":
        case "INTERPOL_HEREDOC":
          index = value.indexOf('"');
          if (index > 0) {
            token.type = value.substr(0, index);
            value = value.substr(index);
          }
          if (name === "INTERPOL_HEREDOC") {
            token.name = "INTERPOL";
            token.value = split_interpol(strip_heredoc(value));
          } else {
            token.value = split_interpol(JSON.parse(value));
          }
          break;
        case "COMMENT":
          token.value = value.substr(1);
          break;
        case "ID":
          if ((index = Booleans.indexOf(value)) >= 0) {
            token.name = "BOOLEAN";
            token.value = index % 2 === 0;
          }
          if ((index = Keywords.indexOf(value)) >= 0) {
            token.name = value;
            delete token.value;
          }
          break;
        case "NUMBER":
          if ((index = value.indexOf(".")) >= 0) {
            token.value = parseFloat(value);
          } else {
            if (value.match(/x/i)) {
              token.value = value.toLowerCase();
            } else {
              token.value = parseInt(value, 10);
            }
          }
          break;
      }

      return token;
    }).filter(function (token) { return token; });
  }

  // Find the token type that matches the most code.
  function find_longest(code) {
    var match, longest, name;
    for (name in Tokens) {
      if (Tokens.hasOwnProperty(name)) {
        match = Tokens[name](code);
        if (match && (!longest || match[1].length > longest.value.length)) {
          longest = {
            name: name,
            value: match[1]
          };
        }
      }
    }
    return longest;
  }

  // Turn the stream of text into a stream of tokens based on the regexps.
  function tokenize(code) {
    // Normalize file endings.
    code = code.replace(/\s$/, "") + "\n";

    // Put comments at the first character of otherwise empty lines.
    code = code.replace(/^\s*#/m, "#")

    var offset = 0,
        length = code.length,
        tokens = [],
        lineno,
        match,
        was_newline = false,
        indent_size = -1,
        current_indent = 0;

    while (offset < length) {
      match = find_longest(code.substr(offset));
      var value_len = match.value.length;

      if(was_newline && match.name == "WS") {
          if(indent_size == -1)
              indent_size = value_len;
          if(value_len % indent_size != 0)
              throw new Error("Indent error on line " + lineno + ". Unrecognized indent: " + indent_size + ", " + value_len);
          var now_indent = value_len / indent_size;
          if(now_indent > current_indent) {
              tokens.push({
                  name: "INDENT",
                  value: match.value.substr(0, indent_size),
                  offset: offset,
                  lineno: lineno
              });
          } else if(now_indent < current_indent) {
              tokens.push({
                  name: "OUTDENT",
                  value: "",
                  offset: offset,
                  lineno: lineno
              });
          }
          current_indent = now_indent;
          offset += value_len;
          was_newline = false;
          continue;
      } else if(was_newline && current_indent) {
        tokens.push({
           name: "OUTDENT",
           value: "",
           offset: offset,
           lineno: lineno
        });
        current_indent = 0;
        offset += value_len;
      }
      lineno = code.substr(0, offset).split("\n").length;
      if (!match)
          throw new Error("Lexer error on line " + lineno + ". Unrecognized input\n" + (offset + 1));
      was_newline = match.name == "NEWLINE";

      if(match.name != "WS")
          tokens.push({
              name: match.name,
              value: match.value,
              offset: offset,
              lineno: lineno
          });
      offset += value_len;
    }
    return analyse(tokens);
  }

  Jack.tokenize = tokenize;

}());

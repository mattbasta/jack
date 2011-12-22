(function () {
  var root = (typeof exports !== "undefined" && exports) || this,
      Jack = root.Jack || (root.Jack = {}),
      Parser = (typeof Jison !== 'undefined' && Jison.Parser) || require('jison').Parser,
      bnf, tokens, parser, name;

  bnf = {
    Root: [
      ["Block", "return $$ = $1"]
    ],
    Block: [
      ["BlockPart", "$$ = {name: 'Block', value: $1}"],
      //["NEWLINE", "$$ = {name: 'Block', value: []}"],
      ["", "$$ = {name: 'Block', value: []}"]
    ],
    BlockPart: [
      ["Statement", "$$ = $1"],
      ["BlockPart Statement", "$$ = $1.concat($2)"]
    ],
    Statement: [
      ["NEWLINE", "$$ = []"],
      ["Comment NEWLINE", "$$ = [$1]"],
      ["Expression NEWLINE", "$$ = [$1]"],
      ["Expression if Expression NEWLINE", '$$ = {name: "If", condition: $5, yes: $1}'],
      ["Expression unless Expression NEWLINE", '$$ = {name: "If", condition: {name: "Not", value: $5}, yes: $1}']
    ],
    Comment: [
      ["COMMENT", "$$ = yytext"]
    ],
    Expression: [
      ["LPAREN Expression RPAREN", "$$ = $2"],
      ["FunctionCall", "$$ = $1"],
      ["Operation", "$$ = $1"],
      ["Literal", '$$ = $1'],
      ["Assign", '$$ = $1'],
      ["ID", "$$ = yytext"],
      ["List", '$$ = $1'],
      ["Object", '$$ = $1'],
      ["Function", '$$ = $1'],
      ["If", "$$ = $1"]
    ],
    Operation: [
      ["Expression . Expression", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}'],
      ["Expression . ID", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}'],
      ["Expression ADDOP Expression", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}'],
      ["Expression OP Expression", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}'],
      ["Expression LOGOP Expression", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}'],
      ["Expression RELOP Expression", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}'],
      ["Expression COMPOP Expression", '$$ = {name: "Binop", lval: $1, op: $2, rval: $3}']
    ],
    Literal: [
      ["STRING", '$$ = yytext'],
      ["BOOLEAN", '$$ = yytext'],
      ["NUMBER", '$$ = yytext'],
      ["REGEX", '$$ = yytext'],
      ["INTERPOL", '$$ = yytext']
    ],
    If: [
      ["if Expression NEWLINE INDENT Block OUTDENT", '$$ = {name: "If", condition: $3, yes: $5}'],
      ["if Expression NEWLINE INDENT Block OUTDENT else NEWLINE INDENT Block OUTDENT", '$$ = {name: "If", condition: $3, yes: $5, no: $8}'],
      ["unless Expression NEWLINE INDENT Block OUTDENT", '$$ = {name: "If", condition: {name: "Not", value: $3}, yes: $5}'],
      ["unless Expression NEWLINE INDENT Block OUTDENT else NEWLINE INDENT Block OUTDENT", '$$ = {name: "If", condition: $3, yes: $8, no: $5}']
    ],
    Assign: [
      ["ID = Expression", '$$ ={name: "Assign", id: $1, value: $3}']
    ],
    List: [
      ["[ ListContents ]", "$$ = {name: 'List', value: $3}"],
      ["[ ID ListContents ]", "$$ = {name: 'List', parent: $2, value: $4}"]
    ],
    ListContents: [
      ["ListItems", "$$ = $1"],
      ["NEWLINE ListBlock NEWLINE", "$$ = $2"]
    ],
    ListBlock: [
      ["ListItems", "$$ = $1"],
      ["ListBlock NEWLINE ListItems", "$$ = $1.concat($3)"]
    ],
    ListItems: [
      ["Expression", "$$ = [$1]"],
      ["ListItems , Expression", "$$ = $1.concat([$3])"]
    ],
    Object: [
      ["{ ObjectItems }", "$$ = {name: 'Object', value: $2}"],
      ["{ ID ObjectItems }", "$$ = {name: 'Object', parent: $2, value: $4}"],
      ["{ NEWLINE ObjectBlock NEWLINE }", "$$ = {name: 'Object', value: $3}"],
      ["{ ID NEWLINE ObjectBlock NEWLINE }", "$$ = {name: 'Object', parent: $2, value: $4}"],
      ["{ ID }", "$$ = {name: 'Object', parent: $2, value: []}"]
    ],
    ObjectBlock: [
      ["ObjectItems", "$$ = $1"],
      ["ObjectBlock NEWLINE ObjectItems", "$$ = $1.concat($3)"]
    ],
    ObjectItems: [
      ["ObjectItem", "$$ = [$1]"],
      ["ObjectItems ObjectItem", "$$ = $1.concat([$3])"]
    ],
    ObjectItem: [
      ["ID = Expression", "$$ = [$1, $3]"]
    ],
    Function: [
      ["def Args ARROW Expression", "$$ = {name: 'Function', value: [$2, $4]}"],
      ["def Args ARROW NEWLINE INDENT Block OUTDENT", "$$ = {name: 'Function', value: [$2, $5]}"]
    ],
    FunctionCall: [
      ["Expression LPAREN CallArgs RPAREN", '$$ = {name: "FunctionCall", obj: $1, args: $3}']
    ],
    Args: [
      ["", "$$ = []"],
      ["ID", "$$ = [$1]"],
      ["Args , ID", "$$ = $1.concat([$3])"]
    ],
    CallArgs: [
      ["", "$$ = []"],
      ["Expression", "$$ = [$1]"],
      ["Args , ID", "$$ = $1.concat([$3])"]
    ]
  };

  // Calculate the tokens from what's left in the grammar.
  tokens = [];
  for (name in bnf) {
    if (bnf.hasOwnProperty(name)) {
      bnf[name].forEach(function (option) {
        if (typeof option === "object") {
          option[0].split(" ").forEach(function (part) {
            if (!bnf[part] && tokens.indexOf(part) < 0) {
              tokens.push(part);
            }
          });
        }
      });
    }
  }

  operators = [
    ["left", "."],
    ["left", "LPAREN", "RPAREN"],
    ["left", "OP"],
    ["left", "ADDOP"],
    ["left", "RELOP"],
    ["left", "LOGOP"],
    ["left", "COMPOP"],
    ["nonassoc", "INDENT", "OUTDENT"],
    ["right", "=", "ARROW", "return"]
  ];

  parser = new Parser({
    bnf: bnf,
    tokens: tokens.join(" "),
    operators: operators.reverse()
  });

  parser.lexer = {
    lex: function () {
      var token = this.tokens[this.pos];
      if (!token) {
        this.yylineno = "END";
        return "";
      }
      this.pos += 1;
      this.yylineno = token.lineno - 1;
      this.yytext = token;
      return token.name;
    },
    setInput: function (tokens) {
      this.tokens = tokens;
      this.pos = 0;
    },
    upcomingInput: function () {
      return "";
    },
    showPosition: function () {
      return this.pos;
    }
  };



  Jack.parse = function () {
    return parser.parse.apply(parser, arguments);
  };

}());

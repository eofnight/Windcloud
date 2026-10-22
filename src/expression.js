// Small, explicit expression interpreter. No eval(), JavaScript or host access.
export function evaluate(source, variables = {}, params = [], depth = 0) {
  if (depth > 12 || source.length > 4096) throw Error('運算式過深或過長');
  const tokens = []; let offset = 0;
  const lexer = /\s*(?:(\d+(?:\.\d+)?)|("[^"\n]*"|'[^'\n]*')|(@(?:\{\w+\}|\w+)|%-?\d{1,2})|(>=|<=|<>|!=|[()+*/\\<>=!&|+-])|([A-Za-z_][A-Za-z0-9_]*))/y;
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break;
    lexer.lastIndex = offset; const match = lexer.exec(source);
    if (!match) throw Error('不支援的運算式：' + source.slice(offset,offset+20));
    offset = lexer.lastIndex;
    if (match[1]) tokens.push({value:Number(match[1])});
    else if (match[2]) tokens.push({value:match[2].slice(1,-1)});
    else if (match[3]) {
      const ref=match[3]; let value;
      if(ref.startsWith('@')) {
        const name=ref.slice(1).replace(/[{}]/g,'');
        if(!Object.hasOwn(variables,name)) throw Error('未定義變數：'+name);
        value=variables[name];
        if (/^[\d\s.+*/()\\-]+$/.test(value) && /[+*/()\\-]/.test(value)) value=evaluate(value,variables,params,depth+1);
      } else {const n=Number(ref.slice(1));value=n<0?params.slice(-n-1).join(' '):(params[n-1]??'');}
      tokens.push({value});
    } else if(match[4]) tokens.push({op:match[4]});
    else {
      const word=match[5].toLowerCase();
      if(['and','or','xor'].includes(word))tokens.push({op:word});
      else tokens.push({value:({true:1,yes:1,on:1,false:0,no:0,off:0})[word]??match[5]});
    }
  }
  let position=0;
  const precedence={or:1,'|':1,xor:2,and:3,'&':3,'=':4,'!=':4,'<>':4,'>':4,'<':4,'>=':4,'<=':4,'+':5,'-':5,'*':6,'/':6,'\\':6};
  const numeric=v=>v!==''&&Number.isFinite(Number(v));
  const truth=v=>numeric(v)?Number(v)!==0:!!v;
  const arithmetic=(op,a,b)=>{
    const both=numeric(a)&&numeric(b);
    if(both){a=Number(a);b=Number(b);}
    if(op==='=')return Number(a===b);
    if(op==='!='||op==='<>')return Number(a!==b);
    if(op==='>')return Number(a>b);if(op==='<')return Number(a<b);
    if(op==='>=')return Number(a>=b);if(op==='<=')return Number(a<=b);
    if(op==='and'||op==='&')return Number(truth(a)&&truth(b));
    if(op==='or'||op==='|')return Number(truth(a)||truth(b));
    if(op==='xor')return Number(truth(a)!==truth(b));
    if(op==='+')return both?a+b:String(a)+String(b);
    if(!both)throw Error('此運算需要數字');
    if((op==='/'||op==='\\')&&b===0)throw Error('不可除以零');
    if(op==='-')return a-b;if(op==='*')return a*b;
    if(op==='/')return Math.trunc(a/b);if(op==='\\')return a%b;
    throw Error('不支援的運算子');
  };
  function atom(){
    const token=tokens[position++];if(!token)throw Error('運算式不完整');
    if(Object.hasOwn(token,'value'))return token.value;
    if(token.op==='('){const value=parse(0);if(tokens[position++]?.op!==')')throw Error('運算括號不成對');return value;}
    if(token.op==='!')return Number(!truth(atom()));
    if(token.op==='-'){const n=atom();if(!numeric(n))throw Error('負號需要數字');return -Number(n);}
    throw Error('運算式格式錯誤');
  }
  function parse(min){
    let value=atom();
    while(position<tokens.length){const op=tokens[position].op,p=precedence[op];if(p===undefined||p<min)break;position++;value=arithmetic(op,value,parse(p+1));}
    return value;
  }
  const value=parse(0);if(position!==tokens.length)throw Error('運算式含多餘內容');
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('運算結果超過限制');
  return value;
}

const arr = [];
for(let i = 0; i < 1000000; i++) {
  arr.push(new Array(1000).fill('test'));
}
arr.length
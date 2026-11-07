# 小游戏合集

五个现有网页游戏放在同一个 GitHub Pages 站点里，各自有地址，合集页只负责挑选。

- 合集：https://liuzhuoling2011.github.io/mini-arcade/
- 大鱼吃小鱼：https://liuzhuoling2011.github.io/mini-arcade/games/big-fish/
- 黄金矿工：https://liuzhuoling2011.github.io/mini-arcade/games/gold-miner/
- 贪吃蛇：https://liuzhuoling2011.github.io/mini-arcade/games/snake/
- 俄罗斯方块：https://liuzhuoling2011.github.io/mini-arcade/games/tetris/
- 2048：https://liuzhuoling2011.github.io/mini-arcade/games/2048/

打开或刷新某一款会直接进入该游戏。大鱼吃小鱼没有「开始游戏」画面。浏览器拦截自动播放时，对局照常开始，第一次按键、点击或触摸后再出声。

顶部是一条共用菜单。换游戏、或页面被切到后台时，正在跑的游戏和声音会暂停。菜单收起或回到页面后，如果不是你自己按的暂停，会继续。

资源按路径放在 `/mini-arcade/` 下。服务工作线程只接管这个前缀，不会拦截同账号下的其他 Pages 项目。它预先缓存合集外壳；某个游戏的图片、脚本和声音只在你打开那一款之后才缓存。没打开过的游戏离线时会提示先联网进入一次。

原来的五个仓库和它们各自的 Pages 站点保持不动。

本地要用带前缀的静态服务打开（不要用 `file://`）：

```bash
python3 - << 'PY'
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
ROOT = os.getcwd()
PREFIX = "/mini-arcade"
class H(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        if not path.startswith(PREFIX):
            return os.path.join(ROOT, "__missing__")
        rel = path[len(PREFIX):].lstrip("/")
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT):
            return os.path.join(ROOT, "__missing__")
        if os.path.isdir(full):
            return os.path.join(full, "index.html")
        return full
ThreadingHTTPServer(("127.0.0.1", 8080), H).serve_forever()
PY
```

然后打开 http://127.0.0.1:8080/mini-arcade/

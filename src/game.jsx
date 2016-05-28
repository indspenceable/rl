import {Empty, Wall, Smoke, TorchTile} from './tile.jsx';
import Player from './player.jsx'
import { toGray } from './util.jsx';
import HunterSeeker from './hunter_seeker.jsx';
import SandWorm from './sand_worm.jsx';
import Spider from './spider.jsx';
import Point from './point.jsx'
import Lighting from './lighting.jsx'

class Game {
  constructor() {
    // set up variables
    this.display = null
    this.map = {}
    this.engine = null
    this.player = null
    this.entities = []
    this.scheduler = null
    this.messages = []
    this._memory = {}

    this._animationQueue = [];
    this.lighting = new Lighting;
  }

  init() {
    // Setup ROT.js
    this.display = new ROT.Display({
        // forceSquareRatio:true,
        // spacing:0.75,
      });
    document.getElementById("game").appendChild(this.display.getContainer());
    this.scheduler = new ROT.Scheduler.Simple();
    this.engine = new ROT.Engine(this.scheduler);

    this._generateMap();
    this.redrawMap();
    this._drawMapUIDivider();
    this._drawUI();

    this.engine.start();
  }

  // TODO this should be done in the entity itself.
  findPathTo(startPoint, endPoint, maxDistance=10000) {
    var path = [];
    var passableCallback = (x,y) => {
      return this.getTile(Point.at([x,y])).isWalkable() && Point.at([x,y]).distance(startPoint) <= maxDistance;
    }
    var astar = new ROT.Path.AStar(...endPoint.coords, passableCallback, {topology: 8});
    astar.compute(...startPoint.coords, function(x,y) {
      path.push(Point.at([x,y]));
    });
    return path;
  }

  getTile(point) {
    var x = point._x;
    var y = point._y;

    if (y < 0 || y >= this.map.length || x < 0 || x >= this.map[0].length) {
      // throw "Attempting to access out-of-bounds tile: " + x + ", " + y;
      return new Wall();
    }
    return this.map[y][x];
  }

  _generateMap() {
    var mapPrototype = [
    '###################################################',
    '#....................#............................#',
    '#.^^.................#............................#',
    '#.^^.................#............................#',
    '#....................#....................###.....#',
    '#....................#.....................##.....#',
    '#....................#.....................^#.....#',
    '#....................#.....................##.....#',
    '#....................#....................###.....#',
    '#....................#............................#',
    '#......................#..........................#',
    '#..........%...........#..........................#',
    '#......................#..........................#',
    '#......................#..........................#',
    '#......................#..........................#',
    '#......................#..........................#',
    '#......................#..........................#',
    '#......................#..........................#',
    '#......................#..........................#',
    '###################################################',
    ]
    this.map = [];
    for (var y = 0; y < mapPrototype.length; y+=1) {
      var currentRow = [];
      this.map.push(currentRow);
      for (var x = 0; x < mapPrototype[0].length; x+=1) {
        var tileType = {
          '.': Empty,
          '#': Wall,
          '%': Smoke,
          '^': TorchTile,
        }[mapPrototype[y][x]];
        currentRow.push(new tileType(x, y));
      }
    }
    this.player = new Player(5,5);
    this._registerEntity(this.player)
    // this._registerEntity(new SandWorm(40, 5));
    // this._registerEntity(new Spider(41, 5));
    // this._registerEntity(new HunterSeeker(42, 5));
    // this.lighting.registerLight({position:Point.at([2,2]), 200);
    this.lighting.registerLight(this.player, [20,100,70]);
    console.log("Done making map! Enabling lighting");
    // this.lighting.enable();
    this.lighting.dirty();
  }

  _registerEntity(entity) {
    this.entities.push(entity);
    this.scheduler.add(entity, true);
  }

   // This is for drawing terrain etc.
  drawMapTileAt(point) {
    if (!this.player.canSee(point)) {
      if (this.getMemory(point)) {
        this.display.draw(...point.coords, ...this.getMemory(point));
      } else {
        this.display.draw(...point.coords, " ");
      }
      return;
    }
    const glyph = this.getTile(point).glyph;
    var color = this.multColor(glyph.fg, this.lighting.lightAt(point))
    this.displayAndSetMemory(point, glyph.c, color, glyph.bg);
  }

  multColor(c1,c2) {
    return ROT.Color.toRGB(
      ROT.Color.add(
        ROT.Color.multiply(ROT.Color.fromString(c1), c2),
        [0,30,10]
      )
    )
  }

  displayAndSetMemory(point, ch, fg, bg) {
    this.setMemory(point, ch, fg, bg)
    this.display.draw(...point.coords, ch||' ', fg, bg);
  }

  deregisterEntity(monster) {
    this.scheduler.remove(monster);
    var index = this.entities.indexOf(monster);
    if (index >= 0) {
      this.entities.splice(index, 1);
    }
    this.drawMapTileAt(monster.position);
  }

  monsterAt(point) {
    return this.entities.find(e => e.isAt(point));
  }

  _drawWholeMap() {
    for (var y = 0; y < this.map.length; y++) {
      for (var x = 0; x < this.map[0].length; x++) {
        this.drawMapTileAt(Point.at([x,y]));
      }
    }
  }

  redrawMap() {
    this.player.visibleTiles.clear();
    // this.lighting.calculate();
    this.player.addFOVToVisibleTiles(this.player.position, 5);
      // {confirmVision: e => (this.lighting.lightAt(e) > 1)});
    this._drawWholeMap();
    this.entities.forEach(e => e.draw());
    // this.player.draw();
  }

  queueAnimation(animation) {
    this._animationQueue.push(animation);
  }

  displayAnimations(callback) {
    if (this._animationQueue.length == 0) {
      return callback();
    }

    this.redrawMap();
    this._animationQueue.forEach(animation => animation.draw());
    this._animationQueue = this._animationQueue.filter(animation => !animation.nextFrame());

    setTimeout(()=> {
      if (this._animationQueue.length > 0) {
        this.displayAnimations(callback);
      } else {
        // this.engine.unlock();
        callback();
      }
    }, 0);
  }


  // UI - move this to it's own shit later?
  _drawMapUIDivider() {
    var x = 55;
    for (var y = 0; y < 25; y+=1) {
      this.display.draw(x, y, "|");
    }
  }

  _drawUI() {
    var x = 56;
    var y = 0;
    var width = 80-56;
    var height = 25;

    this._clearUIRow(x, y, width)
    this.display.drawText(x, y, "@) " + this.player.getName());

    this._clearAndDrawMessageLog();
  }

  _drawMeter(x, y, current, max, meterName, numberOfPips) {
    if (current > max) {
      current = max;
    }
    if (current < 0) {
      current = 0;
    }

    var currentScaled = Math.floor(current*numberOfPips/max);
    var maxScaled = numberOfPips;

    this.display.drawText(x, y, "[" +
      "=".repeat(currentScaled) +
      " ".repeat(maxScaled - currentScaled) +
      "]", "#000", "#000");
  }

  _clearUIRow(x, y, width) {
    for (var j = 0; j < width; j+=1) {
      this.display.draw(x+j, y, " ");
    }
  }

  displayMove(x, y, label, move) {
    if (move !== undefined) {
      var defaultMelee = this.player.defaultMeleeAttack();
      this.display.drawText(x, y,
        label +
        ") " +
      (move === defaultMelee ? '*' : ' ') +
      move.name() +
      " (" +
        move.pp +
        "/" +
        move.maxPP +
        ")");
    }
  }

  _clearAndDrawMessageLog() {
    var x = 56;
    var y = 15;
    var width = 80-56;
    var height = 25-15;

    var index = this.messages.length;

    this.display.drawText(x, y, Array(width).join("-"), "#000", "#000");
    y+=1
    for (var i = 0; i < height-1; i+=1) {
    // clear the line
    for (var j = 0; j < width; j+=1) {
      this.display.draw(x+j, y, " ");
    }

    index -= 1;
    if (index >= 0) {
        // Draw this message
        this.display.drawText(x, y, this.messages[index])
      }
      y+=1;
    }
  }

  logMessage(message) {
    this.messages.push(message);
    this._clearAndDrawMessageLog();
  }

  // AUDIO
  playSound(location, sound) {
    // Sound type unused for now.
    this.entities.forEach(e => {
      // var path = this.findPathTo(location, e.position, 20);
      // if (path.length < 20) {
        e.hear(location, sound);
      // }
    });
  }

  // MEMORY
  getMemory(point) {
    return this._memory[point];
  }

  setMemory(point, ch, fg, bg) {
    if (ch != ' ') {
      this._memory[point] = [ch, toGray(fg), toGray(bg)];
    } else {
      this._memory[point] = [ch, '#000', toGray(fg)];
    }
  }
};

export default new Game();

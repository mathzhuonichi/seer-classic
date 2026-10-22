package
{
   import flash.display.DisplayObjectContainer;
   import flash.display.Loader;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.display.StageAlign;
   import flash.display.StageScaleMode;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.external.ExternalInterface;
   import flash.net.URLRequest;
   import flash.system.ApplicationDomain;
   import flash.system.LoaderContext;

   /**
    * The battle's skill-effect stage. It plays the original skill SWFs as the original fight module did
    * (UseSkillController.petPlay and BaseAnimatorCon):
    * - each SWF loads into its own ApplicationDomain, since every one defines a class named `skill`;
    * - a play creates that class and places it at the acting creature with a uniform scale (a negative scaleX mirrors it);
    * - it starts on the next frame with gotoAndPlay(1) and is sent to frame 2 on the frame after: 398 effects stop() on
    *   frame 1 and only run past it this way;
    * - it is removed once its own frame script sets isEnd.
    * JS calls the ExternalInterface callbacks fxLoad, fxPlay and fxStop. The host answers with trace() lines, which JS
    * reads through Ruffle's traceObserver: "fx|ready|<frame rate>", "fx|loaded|<key>" and "fx|error|<key>|<reason>".
    */
   public class FxHost extends Sprite
   {
      private var classes:Object = {};
      private var loaders:Object = {};
      private var pending:Array = [];
      private var live:Array = [];
      private var nextId:int = 1;

      public function FxHost()
      {
         super();
         if(stage) { init(null); } else { addEventListener(Event.ADDED_TO_STAGE, init); }
      }

      private function init(event:Event) : void
      {
         stage.scaleMode = StageScaleMode.NO_SCALE;
         stage.align = StageAlign.TOP_LEFT;
         ExternalInterface.addCallback("fxLoad", fxLoad);
         ExternalInterface.addCallback("fxPlay", fxPlay);
         ExternalInterface.addCallback("fxStop", fxStop);
         addEventListener(Event.ENTER_FRAME, start);
         addEventListener(Event.EXIT_FRAME, finish);
         trace("fx|ready|" + stage.frameRate);
      }

      /** Starts loading one skill SWF; false when it was asked for already. */
      public function fxLoad(key:String, url:String) : Boolean
      {
         if(loaders[key]) { return false; }
         var loader:Loader = new Loader();
         loaders[key] = loader;
         loader.contentLoaderInfo.addEventListener(Event.COMPLETE, function(event:Event):void { define(key, loader); });
         loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, function(event:Event):void { trace("fx|error|" + key + "|io"); });
         var context:LoaderContext = new LoaderContext(false, new ApplicationDomain());
         context.allowCodeImport = true;
         loader.load(new URLRequest(url), context);
         return true;
      }

      private function define(key:String, loader:Loader) : void
      {
         try
         {
            classes[key] = loader.contentLoaderInfo.applicationDomain.getDefinition("skill") as Class;
            // The SWF's own root timeline is its authoring template, which the client never showed.
            var root:MovieClip = loader.content as MovieClip;
            if(root)
            {
               root.stop();
               while(root.numChildren > 0) { root.removeChildAt(0); }
            }
            trace("fx|loaded|" + key);
         }
         catch(error:Error)
         {
            trace("fx|error|" + key + "|" + error.message);
         }
      }

      /** Places a loaded effect at (x, y); `still` > 0 holds that frame instead of playing. -1 when it is not loaded. */
      public function fxPlay(key:String, x:Number, y:Number, scaleX:Number, scaleY:Number, still:int) : int
      {
         var Skill:Class = classes[key] as Class;
         if(!Skill) { return -1; }
         var clip:MovieClip = new Skill() as MovieClip;
         clip.stop();
         clip.x = x;
         clip.y = y;
         clip.scaleX = scaleX;
         clip.scaleY = scaleY;
         var play:Object = {"id":nextId++, "clip":clip, "still":still, "started":false};
         pending.push(play);
         return play.id;
      }

      /** Removes a pending or playing effect; false when it has ended already. */
      public function fxStop(id:int) : Boolean
      {
         for(var i:int = 0; i < pending.length; i++)
         {
            if(pending[i].id == id) { pending.splice(i, 1); return true; }
         }
         for(var j:int = 0; j < live.length; j++)
         {
            if(live[j].id == id) { remove(j); return true; }
         }
         return false;
      }

      private function start(event:Event) : void
      {
         for each(var running:Object in live)
         {
            if(!running.started && !running.still)
            {
               running.started = true;
               running.clip.gotoAndPlay(2);
            }
         }
         while(pending.length > 0)
         {
            var play:Object = pending.shift();
            addChild(play.clip);
            if(play.still)
            {
               play.clip.gotoAndStop(play.still);
               stopAll(play.clip);
            }
            else
            {
               playAll(play.clip);
               play.clip.gotoAndPlay(1);
            }
            live.push(play);
         }
      }

      private function finish(event:Event) : void
      {
         for(var i:int = live.length - 1; i >= 0; i--)
         {
            if(!live[i].still && live[i].clip.isEnd == 1) { remove(i); }
         }
      }

      private function remove(index:int) : void
      {
         var clip:MovieClip = live[index].clip;
         live.splice(index, 1);
         stopAll(clip);
         removeChild(clip);
      }

      private function playAll(container:DisplayObjectContainer) : void
      {
         for(var i:int = 0; i < container.numChildren; i++)
         {
            var child:MovieClip = container.getChildAt(i) as MovieClip;
            if(child) { child.play(); playAll(child); }
         }
      }

      private function stopAll(clip:MovieClip) : void
      {
         clip.stop();
         for(var i:int = 0; i < clip.numChildren; i++)
         {
            var child:MovieClip = clip.getChildAt(i) as MovieClip;
            if(child) { stopAll(child); }
         }
      }
   }
}

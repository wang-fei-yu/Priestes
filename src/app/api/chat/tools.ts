export const MUSIC_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'play_music',
      description: `播放或控制音乐。当用户要求播放歌曲、听音乐、放首歌、暂停、继续播放、下一首、调音量时调用此函数。
播放音乐时，系统会尝试连接用户已安装的音乐播放器（如网易云音乐、酷狗音乐、QQ音乐）或打开免费音乐网站。
如果歌曲需要VIP才能收听，请在回复中提醒用户。`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，如歌曲名、歌手名、音乐类型（轻音乐/古典/流行等）。控制类动作可留空。',
          },
          action: {
            type: 'string',
            enum: ['play', 'pause', 'resume', 'next', 'prev', 'stop', 'volume_up', 'volume_down'],
            description: `play=搜索并播放音乐, pause=暂停, resume=继续, next=下一首, prev=上一首, stop=停止, volume_up=音量增大, volume_down=音量减小`,
          },
          source: {
            type: 'string',
            enum: ['netease', 'kugou', 'qqmusic', 'web'],
            description: `优先使用的音乐源: netease=网易云音乐, kugou=酷狗音乐, qqmusic=QQ音乐, web=网页搜索。仅在用户指定了播放器时才填写，否则留空让系统自动选择。`,
          },
        },
        required: ['action'],
      },
    },
  },
]

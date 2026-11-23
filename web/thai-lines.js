const thaiLines=new Map([
 [
  "\"Please tell me your name.\"",
  "บอกชื่อคุณให้ฉันรู้หน่อยสิคะ"
 ],
 [
  "\"...Fufu, this won't do.\n It appears some of your memories have remained.\"",
  "...ฮึ ๆ แบบนี้คงไม่ได้ ดูเหมือนคุณจะยังจำอะไรบางอย่างได้อยู่นะคะ"
 ],
 [
  "\"\\c[2]These memories would only be a hindrance.\\c[0]\n For your most meaningful life that is to come...\n We'll have to remove all that's left.\"",
  "ความทรงจำพวกนั้นมีแต่จะถ่วงคุณไว้ ถ้าอยากให้ชีวิตใหม่ของคุณมีความหมาย... เราคงต้องลบส่วนที่เหลือให้หมด"
 ],
 [
  "\"Kihihi. Finally noticed～?\"",
  "คิ ๆ เพิ่งรู้ตัวเหรอ?"
 ],
 [
  "\"...What? I'm just joking. \\!\n Now, please do answer seriously.\"",
  "...อะไรคะ? ฉันล้อเล่นน่า เอาละ คราวนี้ตอบจริง ๆ ได้แล้วค่ะ"
 ],
 [
  "\"Fufufu.\n An odd thing to say. You're no little girl.\"",
  "ฮึ ๆ พูดอะไรแปลก ๆ คุณไม่ใช่เด็กผู้หญิงตัวเล็ก ๆ สักหน่อย"
 ],
 [
  "\"What a tease.\n Did you want to see how I would react?\"",
  "ชอบแกล้งกันจริง อยากเห็นเหรอคะว่าฉันจะทำหน้ายังไง?"
 ],
 [
  "\"Kyaa, Lady \\n[1] is sooo cooool!\n So wise, so dignified, so majestic～!\"",
  "กรี๊ด ท่านหญิง \\N[1] เท่จังเลยค่ะ! ทั้งปราดเปรื่อง ทั้งสง่างาม สมศักดิ์ศรีจริง ๆ!"
 ],
 [
  "\".........Ahem. Was that good enough?\n Now, please do answer seriously.\"",
  ".........อะแฮ่ม พอใจหรือยังคะ? คราวนี้ช่วยตอบจริง ๆ เสียที"
 ],
 [
  "\"\\N[1], is that right?\"",
  "\\N[1] ใช่ไหมคะ?"
 ],
 [
  "Yes",
  "ใช่"
 ],
 [
  "No",
  "ไม่ใช่"
 ],
 [
  "\"Ah, \\n[1], good morning.\n Fufu. You have cute sleepy eyes.\"",
  "อรุณสวัสดิ์ค่ะ \\N[1] ฮึ ๆ ตาปรือเชียว น่ารักดีนะคะ"
 ],
 [
  "\"The situation at hand may prove difficult to\n explain. For now, I ask that you simply follow\n my words.\\! It'll surely be to your benefit.\"",
  "เรื่องตอนนี้คงอธิบายยากสักหน่อย เอาเป็นว่าลองทำตามที่ฉันบอกก่อนนะคะ แล้วคุณจะรู้ว่ามันดีกับตัวคุณเอง"
 ],
 [
  "\"First, please choose your background.\"",
  "ก่อนอื่น เลือกภูมิหลังของคุณก่อนนะคะ"
 ],
 [
  "\"It's something you only get to do once,\n so do be careful.\"",
  "เลือกได้ครั้งเดียว คิดให้ดีก่อนนะคะ"
 ],
 [
  "\"I see you've been reborn as your new self.\n I think it's a great fit!\"",
  "ได้เกิดใหม่ในฐานะนี้แล้วสินะคะ ฉันว่าเหมาะกับคุณดีนะ!"
 ],
 [
  "\"Next comes...a vulgar question...\\!\n Are you interested in carnal acts?\"",
  "คำถามต่อไป... อาจจะไม่ค่อยสุภาพสักหน่อย คุณสนใจเรื่องบนเตียงไหมคะ?"
 ],
 [
  "Interested",
  "สนใจ"
 ],
 [
  "Not interested",
  "ไม่สนใจ"
 ],
 [
  "\"Fufu. Honest, aren't you?\n I, personally, think that's great.\"",
  "ฮึ ๆ ตอบตรงดีนะคะ ฉันชอบค่ะ"
 ],
 [
  "\"Oh my! A gentleman, aren't you?\n That's a little disappointing...\"",
  "แหม เป็นสุภาพบุรุษจังนะคะ แอบเสียดายนิด ๆ แฮะ..."
 ],
 [
  "\"Oh dear...are you getting sleepy?\"",
  "ตายจริง... เริ่มง่วงแล้วเหรอคะ?"
 ],
 [
  "Sleepy",
  "ง่วงแล้ว"
 ],
 [
  "Not sleepy",
  "ยังไม่ง่วง"
 ],
 [
  "\"Fufu. I see, then...\"",
  "ฮึ ๆ อย่างนั้นเองสินะคะ ถ้าอย่างนั้น..."
 ],
 [
  "\"Even though you say that, I can see that your upper\n and lower eyelids will soon become fast friends.\n There's no need to force yourself.\"",
  "ปากก็บอกอย่างนั้น แต่ตาจะปิดอยู่แล้วนะคะ ไม่ต้องฝืนหรอก"
 ],
 [
  "\"On this note, my questions end.\n Thank you very much for keeping me company.\"",
  "ฉันถามแค่นี้แหละค่ะ ขอบคุณที่อยู่คุยเป็นเพื่อนนะคะ"
 ],
 [
  "\"Until your story begins...\\!\n Please enjoy a peaceful rest.\"",
  "กว่าจะถึงเวลาที่เรื่องราวของคุณเริ่มขึ้น... หลับให้สบายนะคะ"
 ],
 [
  "\\c[2]【The Knight】\\c[0]\nHigh Attack and Defense. Knows techniques for\nlowering enemy Attack and Defense.",
  "【อัศวิน】 พลังโจมตีและพลังป้องกันสูง มีท่าลดพลังโจมตีและพลังป้องกันของศัตรู"
 ],
 [
  "\"Is this the background of your choice?\"",
  "จะเลือกภูมิหลังนี้ใช่ไหมคะ?"
 ],
 [
  "\\c[2]【The Thief】\\c[0]\nIncredibly high Speed. Knows a technique for\nslaying foes in a single blow.\nBegins with 1000 bonus Souls.",
  "【โจร】 ความเร็วสูงมาก มีท่าปลิดชีพศัตรูในครั้งเดียว และเริ่มเกมด้วยโซลเพิ่ม 1,000"
 ],
 [
  "\\c[2]【The Sorcerer】\\c[0]\nIncredibly high Magic.\nKnows how to cast Soul Arrow(attack sorcery).",
  "【จอมเวท】 พลังเวทสูงมาก ใช้ Soul Arrow ซึ่งเป็นเวทโจมตีได้"
 ],
 [
  "\\c[2]【The Cleric】\\c[0]\nHigh Magic and Magic Defense.\nKnows how to cast Soul Light(healing sorcery).",
  "【นักบวช】 พลังเวทและพลังป้องกันเวทสูง ใช้ Soul Light ซึ่งเป็นเวทรักษาได้"
 ],
 [
  "\\c[2]【The Warrior】\\c[0]\nIncredibly high Attack.\nHis regular attacks inflict Break.\nKnows a technique that increases his Crit Chance.",
  "【นักรบ】 พลังโจมตีสูงมาก การโจมตีปกติทำให้เกิด Break และมีท่าเพิ่มโอกาสโจมตีติดคริติคอล"
 ],
 [
  "\\c[2]【The Templar】\\c[0]\nHigh Attack, Defense, and Magic Defense.\nKnows how to cast Soul Arrow(attack sorcery) and can\nuse a technique that lowers enemy Magic Defense.",
  "【อัศวินเทมพลาร์】 พลังโจมตี พลังป้องกัน และพลังป้องกันเวทสูง ใช้ Soul Arrow ได้ และมีท่าลดพลังป้องกันเวทของศัตรู"
 ],
 [
  "\\c[2]【The Hunter】\\c[0]\nHigh Attack, Evasion, and Magic Evasion.\nDeals extra damage to beasts. Begins with a gun\ninstead of a shield, which changes Break skill.",
  "【นายพราน】 พลังโจมตี การหลบหลีก และการหลบเวทสูง โจมตีสัตว์ร้ายแรงขึ้น เริ่มต้นด้วยปืนแทนโล่ ทำให้ท่า Break เปลี่ยนไป"
 ],
 [
  "\\c[2]【The Explorer】\\c[0]\nIncredibly high Luck.\nHas no particular strengths, but begins with\na good number of consumables.",
  "【นักสำรวจ】 โชคสูงมาก ด้านอื่นไม่โดดเด่นเป็นพิเศษ แต่มีของใช้ติดตัวมาเยอะ"
 ],
 [
  "\\c[2]【The Fluffy】\\c[0]\nA furry enigma.\nBegins with no equipment, but all of his parameters\nare slightly higher.",
  "【เจ้าขนฟู】 สิ่งมีชีวิตขนปุยปริศนา เริ่มต้นมือเปล่า แต่ค่าสถานะทุกด้านสูงขึ้นเล็กน้อย"
 ],
 [
  "\"......Is this the background of your choice?\"",
  "......จะเลือกภูมิหลังนี้จริง ๆ เหรอคะ?"
 ],
 [
  "Skip the prologue?\n(Roughly 2 minutes long.)",
  "ข้ามบทนำไหม? (ใช้เวลาประมาณ 2 นาที)"
 ],
 [
  "Please choose your Alice.",
  "เลือกอลิสของคุณ"
 ],
 [
  "Daughter Alice",
  "อลิสที่เป็นลูกสาว"
 ],
 [
  "Little sister Alice",
  "อลิสที่เป็นน้องสาว"
 ],
 [
  "Mother Alice",
  "อลิสที่เป็นแม่"
 ],
 [
  "\"————a.\"",
  "——า..."
 ],
 [
  "...I can hear someone calling me.\nHer voice is lovely and beautiful, with a tinge\nof translucency to it.",
  "...มีใครกำลังเรียกฉัน เสียงนั้นไพเราะ อ่อนหวาน และใสราวกับแก้ว"
 ],
 [
  "\"————————————a.\"",
  "————า..."
 ],
 [
  "...Ahh, I know this voice.\nGradually, my consciousness clears, as if coming\nfrom a long sleep.",
  "...อา ฉันจำเสียงนี้ได้ สติค่อย ๆ แจ่มชัดขึ้น ราวกับเพิ่งตื่นจากหลับใหลอันยาวนาน"
 ],
 [
  "Indeed, next to me is...",
  "คนที่อยู่ข้าง ๆ ฉันก็คือ..."
 ],
 [
  "\\c[2]Alice Liddell\\c[0]",
  "อลิส ลิดเดลล์"
 ],
 [
  "\\c[2]\"You noticedyou noticedyou noticedyou noticedyou noticedyou noticed\nyou noticedyou noticedyou noticedyou noticedyou noticedyou noticed\nyou noticedyou noticedyou noticedyou noticedyou noticedyou noticed\nyou noticedyou noticedyou noticedyou noticedyou noticed\\|\\|\\|\\^",
  "รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ รู้แล้วสินะ"
 ],
 [
  "It's my dear daughter, \\c[2]Alice\\c[0].",
  "อลิส ลูกสาวสุดที่รักของฉัน"
 ],
 [
  "\"Hey, hey, Papa. PAPA!\"",
  "พ่อจ๋า พ่อ! ได้ยินไหม!"
 ],
 [
  "\"And then, then what? How does the story\n continue? Sir Knight defeated the evil\n dragon, right?\"",
  "แล้วไงต่อคะพ่อ? เล่าต่อสิ คุณอัศวินปราบมังกรร้ายได้ใช่ไหม?"
 ],
 [
  "Holding a picture book, Alice is waiting for my reply\nwith glittering eyes.",
  "อลิสกอดหนังสือนิทานไว้ ดวงตาเป็นประกาย รอฟังคำตอบจากฉัน"
 ],
 [
  "Of course.\nThe white knight struck down the dragon and saved\nthe princess. They all lived happily ever after,\nthe curtain falls, the book is over. It's a happy end.",
  "แน่นอน อัศวินขาวปราบมังกร ช่วยเจ้าหญิง แล้วทุกคนก็อยู่ด้วยกันอย่างมีความสุขตลอดไป ม่านปิด หนังสือจบ เป็นตอนจบที่มีความสุข"
 ],
 [
  "...A common, ordinary ending.\nAnd yet, it is met with a sigh of wonder and a cry of\ndelight. For the little girl, there's no better way\nto end a story.",
  "...ตอนจบธรรมดาที่ได้ยินกันจนชิน แต่เด็กน้อยกลับถอนหายใจอย่างทึ่งแล้วร้องด้วยความดีใจ สำหรับเธอ ไม่มีตอนจบไหนดีกว่านี้อีกแล้ว"
 ],
 [
  "\"Sir Knight is sooo cooool～!\n Alice wants to be a princess too...\"",
  "คุณอัศวินเท่ที่สุดเลย! อลิสก็อยากเป็นเจ้าหญิงบ้าง..."
 ],
 [
  "\"And if Alice is the Princess...\n then Papa is Sir Knight!\n We'll ride on a horsie and you'll\n take me everywhere with you!\"",
  "ถ้าอลิสเป็นเจ้าหญิง... พ่อก็เป็นคุณอัศวิน! เราจะขี่ม้าด้วยกัน พ่อจะพาอลิสไปทุกที่เลย!"
 ],
 [
  "\"And, and, you know...\n If the Evil Dragon carries Alice\n away, you'll come to save me!\n Not the next time! Right away!\"",
  "แล้วก็ ถ้ามังกรร้ายคาบอลิสไป พ่อต้องมาช่วยนะ! ไม่เอาไว้คราวหน้า ต้องมาทันทีเลย!"
 ],
 [
  "\"And then, and then...\n Papa'll go bam! and defeat the dragon.\n And we'll live in the castle together!\\!\n Alice and Papa will marry...ehehe...\"",
  "แล้วพ่อก็จะฟันฉับ! ปราบมังกรได้ เราจะอยู่ในปราสาทด้วยกัน แล้วอลิสก็จะแต่งงานกับพ่อ... อิ ๆ..."
 ],
 [
  "I want to marry Alice",
  "พ่ออยากแต่งงานกับอลิส"
 ],
 [
  "Mama will scold us",
  "เดี๋ยวแม่ก็ดุเราหรอก"
 ],
 [
  "It's too early for Alice",
  "อลิสยังเด็กไปนะ"
 ],
 [
  "\"Ehehe～.\n Ah, but you need to show how cool you are,\n ok? No losing duels like the red knight!\"",
  "อิ ๆ แต่พ่อต้องโชว์ความเท่ให้ดูด้วยนะ ห้ามแพ้ดวลเหมือนอัศวินแดงล่ะ!"
 ],
 [
  "\"Mama will not!\n The one Alice loves the most in the whole\n world is Papa!\"",
  "แม่ไม่ดุหรอก! คนที่อลิสรักที่สุดในโลกก็คือพ่อนะ!"
 ],
 [
  "\"Booo～～～!\n You're treating me like a child again!\n Alice's already an adult!\"",
  "โธ่! พ่อเห็นอลิสเป็นเด็กอีกแล้ว อลิสโตแล้วนะ!"
 ],
 [
  "\"Hey, Papa, um...\n There's one thing...",
  "พ่อจ๋า คือว่า... อลิสมีเรื่องอยากขอ..."
 ],
 [
  "\"Alice has been helping out a lot at home...\\!\n So can you take me to the amusement park\n tomorrow...?\n ...You can't?\"",
  "อลิสช่วยงานบ้านตั้งเยอะ... พรุ่งนี้พ่อพาไปสวนสนุกได้ไหมคะ...? ...ไม่ได้เหรอ?"
 ],
 [
  "\"Papa...?\n Hey, Papa, what's wrong?\n Are you falling asleep again?",
  "พ่อคะ...? พ่อเป็นอะไรไป จะหลับอีกแล้วเหรอ?"
 ],
 [
  "\"Papa?!\n No sleeping! Wake uuuup～～!\"",
  "พ่อ?! ห้ามหลับนะ ตื่นสิพ่อออ!"
 ],
 [
  "It's my dear little sister, \\c[2]Alice\\c[0].",
  "อลิส น้องสาวสุดที่รักของฉัน"
 ],
 [
  "\"Good morning, Big Brother♪\"",
  "อรุณสวัสดิ์ค่ะพี่♪"
 ],
 [
  "\"Now, please open wide.\\!\n Come on, 'aaah'.\"",
  "ไหน อ้าปากกว้าง ๆ สิคะ เอ้า อ้าม..."
 ],
 [
  "I open my mouth to yawn, and Alice thrusts something\ninside. Inadvertently chewing, I can feel the taste\nof beef tingling my taste buds.",
  "ฉันอ้าปากจะหาว อลิสก็ส่งอะไรสักอย่างเข้าปาก พอเผลอเคี้ยว รสเนื้อวัวก็แผ่ซ่านไปทั่วลิ้น"
 ],
 [
  "\"Hihi♪\n Big Brother, is it tasty?\"",
  "ฮิ ๆ♪ อร่อยไหมคะพี่?"
 ],
 [
  "...It's ok.\nStill, if I compare it to Alice's first attempt\nat cooking, I can't deny that it's quite tasty.",
  "...ก็ใช้ได้ เทียบกับตอนอลิสเข้าครัวครั้งแรกแล้ว ต้องยอมรับว่าคราวนี้อร่อยทีเดียว"
 ],
 [
  "\"Geez...I worked my hardest to cook just\n for this picnic with you, Big Brother.\n So no falling asleep!\"",
  "โธ่... หนูตั้งใจทำสุดฝีมือเพื่อมาปิกนิกกับพี่เลยนะ ห้ามหลับด้วย!"
 ],
 [
  "\"Let's keep this up, have another bite♪\n Hihihi, your little sister has developed\n great taste, you know!\"",
  "เอาอีกคำสิคะ♪ ฮิ ๆ น้องสาวพี่ฝีมือดีขึ้นเยอะแล้วนะ!"
 ],
 [
  "Met with her dazzling smile, I cannot refuse.\nChecking that no one is watching, I let my\nlittle sister feed me.",
  "เห็นรอยยิ้มสดใสแบบนั้น ฉันก็ปฏิเสธไม่ลง พอแน่ใจว่าไม่มีใครมอง ก็ยอมให้น้องป้อน"
 ],
 [
  "\"Hihi, has it all disappeared in your\n mouth already? Then, palms together...\n Thank you for the meal!\"",
  "ฮิ ๆ หมดปากแล้วเหรอคะ? งั้นพนมมือด้วยกัน... ขอบคุณสำหรับอาหารค่ะ!"
 ],
 [
  "\"There, there, as expected of my Brother～♪\n I'll make you another lunch tomorrow!\n I'm thinking of challenging myself with\n a new menu, so get ready!\"",
  "เก่งมาก สมกับเป็นพี่ของหนูเลย♪ พรุ่งนี้หนูจะทำข้าวกล่องให้อีก คราวนี้จะลองทำเมนูใหม่ ตั้งตารอได้เลย!"
 ],
 [
  "I'm always ready",
  "พี่พร้อมเสมอ"
 ],
 [
  "It'd be embarrassing if people talk",
  "ถ้าคนเอาไปพูดกัน พี่คงเขินแย่"
 ],
 [
  "Somebody, save me...",
  "ใครก็ได้ ช่วยที..."
 ],
 [
  "\"Oh my, Big Brother♪\n You can’t resist my cooking already, hmm?\"",
  "แหม พี่คะ♪ ติดใจอาหารฝีมือหนูแล้วใช่ไหมล่ะ?"
 ],
 [
  "\"People might think we are lovers?\n Haha...w-well, I wouldn't really mind...\"",
  "คนจะคิดว่าเราเป็นแฟนกันเหรอ? ฮะ ๆ... กะ ก็หนูไม่ได้ว่าอะไรสักหน่อย..."
 ],
 [
  "\"Eh, what are you saying?\n It'll be fine! I won't burn it black\n like the time before last!\"",
  "เอ๊ะ พี่พูดอะไรน่ะ? ไม่เป็นไรหรอก คราวนี้หนูไม่ทำไหม้เป็นถ่านเหมือนคราวนู้นแน่!"
 ],
 [
  "\"Brother, huuuuuuug♪\"",
  "พี่จ๋า ขอกอดหน่อยยย♪"
 ],
 [
  "\"Waaa-waaah...I don't wanna leave.\n It's great, isn't it～? A precious\n holiday for just the two of us.\"",
  "งื้อ... ยังไม่อยากกลับเลย วันหยุดที่ได้อยู่กับพี่แค่สองคนแบบนี้ มีความสุขจังเนอะ?"
 ],
 [
  "\"Big Brother, you know, I'm always,\n always thinking about you...\n I-I'm serious!\"",
  "พี่รู้ไหม หนูคิดถึงพี่ตลอดเลยนะ... พะ พูดจริง ๆ นะ!"
 ],
 [
  "\"Big Brother...? What's wrong?\n D-don't tell me the food was too strong\n for you?! Oh no-no-no...\"",
  "พี่...? เป็นอะไรไปคะ? อย่าบอกนะว่ารสจัดเกินไป?! ไม่นะ ๆ..."
 ],
 [
  "\"Big Brotheeer～!!\n Please don't diieee～!!\"",
  "พี่จ๋าาา!! อย่าเพิ่งตายนะะะ!!"
 ],
 [
  "It's my dear mother, \\c[2]Alice\\c[0].",
  "อลิส แม่ที่ฉันรัก"
 ],
 [
  "\"Ah...\n I'm sorry, did you wake up?\"",
  "อ๊ะ... ขอโทษจ้ะ แม่ทำให้ตื่นเหรอ?"
 ],
 [
  "That seems to be the case.\nWatching me yawn, she lets out a soft giggle\nand gently brushes my hair.",
  "คงอย่างนั้น พอเห็นฉันหาว แม่ก็หัวเราะเบา ๆ แล้วลูบผมฉันอย่างอ่อนโยน"
 ],
 [
  "\"Fufu, no matter how old, you'll always be\n my dear boy. Allow mother to sing a song\n for you. Can you remain lying for a bit\n longer...?\"",
  "ฮึ ๆ ต่อให้โตแค่ไหน ลูกก็ยังเป็นลูกชายคนดีของแม่อยู่วันยังค่ำ ให้แม่ร้องเพลงให้ฟังนะ นอนต่ออีกหน่อยได้ไหมจ๊ะ?"
 ],
 [
  "It is an attractive proposition.\nWith mother's soft thighs as pillows, I'll\nfall asleep again in no time...",
  "ช่างเป็นข้อเสนอที่ชวนใจอ่อน ถ้าได้หนุนตักนุ่ม ๆ ของแม่ อีกเดี๋ยวฉันก็คงหลับไปอีก..."
 ],
 [
  "No, I wouldn't want someone to see us like this.\nReluctantly, I force myself to decline.",
  "แต่ฉันไม่อยากให้ใครมาเห็นเราแบบนี้ ถึงจะเสียดาย ก็ต้องฝืนใจปฏิเสธไป"
 ],
 [
  "\"You've had enough for today?\n I see...I understand.\"",
  "วันนี้พอแล้วเหรอจ๊ะ? อืม... แม่เข้าใจจ้ะ"
 ],
 [
  "\"I wonder how many years it has been since\n I last came to this riverside. It's all been\n so busy after your father left, I could never\n make the time to come...\"",
  "กี่ปีแล้วนะที่แม่ไม่ได้มาริมน้ำตรงนี้ ตั้งแต่พ่อของลูกจากไป แม่ก็วุ่นเสียจนหาเวลามาไม่ได้เลย..."
 ],
 [
  "\"By the way...\\!\n The outfit mother's wearing today,\n perhaps it fits rather well...?\"",
  "ว่าแต่... ชุดที่แม่ใส่วันนี้ ดูเข้ากับแม่ดีไหมจ๊ะ?"
 ],
 [
  "You're like a princess",
  "แม่เหมือนเจ้าหญิงเลย"
 ],
 [
  "You've still got it",
  "แม่ยังสวยเหมือนเดิมเลย"
 ],
 [
  "It's very tight",
  "มันรัดมากเลยนะ"
 ],
 [
  "\"Geez♪ You praise me too much...\n but thank you.\"",
  "แหม♪ ปากหวานจริง ๆ... แต่ก็ขอบใจนะจ๊ะ"
 ],
 [
  "\"Really? Glad to hear...I sewed it\n after my favorite childhood clothes.\n I'm happy I could show them to you.\"",
  "จริงเหรอจ๊ะ? ดีใจจัง แม่เย็บตามแบบชุดโปรดสมัยเด็ก ดีจังที่ได้ใส่ให้ลูกดู"
 ],
 [
  "\"Gah....don't say something so cruel.\n You'll make mother cry.\"",
  "โธ่... อย่าพูดใจร้ายแบบนั้นสิ เดี๋ยวแม่ก็ร้องไห้หรอก"
 ],
 [
  "\"...You know, mother is thinking that she\n should stop looking for a new someone.\"",
  "...แม่กำลังคิดอยู่ว่า แม่คงพอแล้วล่ะกับการมองหาใครสักคนมาเป็นคู่ชีวิต"
 ],
 [
  "\"I'm already at this age...\n It's difficult to find someone who would\n appreciate Gothic Lolita fashion, difficult\n to communicate it.\"",
  "แม่ก็อายุปูนนี้แล้ว จะหาใครที่ชอบแฟชั่นโกธิคโลลิต้าเหมือนกันก็ยาก จะอธิบายให้เข้าใจก็ยากอีก"
 ],
 [
  "\"I will still be quite busy in the future,\n but...would you like for us to always live\n together, just the two of us?\"",
  "ต่อไปแม่ก็คงยังยุ่งอยู่... แต่ลูกอยากอยู่ด้วยกันแบบนี้ไปตลอด แค่เราสองคนไหมจ๊ะ?"
 ],
 [
  "\"Ahh...but if there's something \\n[1] wants\n to do, then that takes precedence.\n Mother will manage even alone, right?\"",
  "อ้อ... แต่ถ้า \\N[1] มีอะไรที่อยากทำ ก็ทำสิ่งนั้นก่อนนะลูก อยู่คนเดียวแม่ก็ดูแลตัวเองได้ จริงไหมจ๊ะ?"
 ],
 [
  "\"...?\n \\n[1], what's the matter?\n Still sleepy?\"",
  "หืม...? \\N[1] เป็นอะไรไปจ๊ะ? ยังง่วงอยู่เหรอ?"
 ],
 [
  "\"Fufu, you helpless child. \\!\n Fine...you can rest in mother's\n lap again. Have nice dreams.\"",
  "ฮึ ๆ เด็กน้อยของแม่ เอ้า... มาหนุนตักแม่อีกรอบก็ได้ ฝันดีนะลูก"
 ]
]);

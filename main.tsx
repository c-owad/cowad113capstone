import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Fallback Local Data (in case of no internet) ---
const FALLBACK_SENTENCES = [
  "The quick brown fox jumps over the lazy dog.",
  "React Native makes building mobile apps intuitive.",
  "Coding is the art of solving puzzles with logic.",
  "Water boils at one hundred degrees Celsius.",
  "How fast can your fingers dance across the screen?"
];

const FALLBACK_WORDS = [
  "react", "native", "logic", "puzzle", "coding", 
  "javascript", "app", "mobile", "keyboard", "developer",
  "compile", "render", "syntax", "array", "object",
  "water", "house", "light", "sound", "music", "world"
];

// --- RPG Enemy & Difficulty Data ---
const ENEMIES = [
  { name: 'Slime 🦠', maxHP: 50 },     
  { name: 'Goblin 👺', maxHP: 100 },  
  { name: 'Dragon 🐉', maxHP: 200 },  
];

const DIFFICULTIES = {
  Easy: { percent: 0.70, healOnKill: 50 },  
  Normal: { percent: 0.85, healOnKill: 30 }, 
  Hard: { percent: 1.00, healOnKill: 10 },   
};

export default function RapidTypeGame() {
  // --- Core Configuration State ---
  const [currentScreen, setCurrentScreen] = useState('Menu'); 
  const [gameMode, setGameMode] = useState('Standard'); 
  const [exerciseType, setExerciseType] = useState('Sentences'); 
  const [allowErrors, setAllowErrors] = useState(false);
  const [difficulty, setDifficulty] = useState('Normal');
  
  // --- High Scores ---
  const [highScoreRpg, setHighScoreRpg] = useState(0);
  const [highScoreStandard, setHighScoreStandard] = useState(0);
  
  // --- Active Game/Typing State ---
  const [targetSentence, setTargetSentence] = useState('');
  const [inputText, setInputText] = useState('');
  const [maxCorrectChars, setMaxCorrectChars] = useState(0); 
  const [hasStartedTyping, setHasStartedTyping] = useState(false); 
  const [isLoadingText, setIsLoadingText] = useState(false);

  // --- Auto-Scrolling State ---
  const scrollViewRef = useRef(null);
  const [textLines, setTextLines] = useState([]);

  // --- External Data Cache ---
  const commonWordsCache = useRef([]);

  // --- Strict WPM Tracking Refs ---
  const trackingStats = useRef({
    cumulativeTimeMs: 0,
    totalWordsTyped: 0,
    sentenceStartTime: null
  });

  // --- RPG Specific State ---
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState('');
  const [playerHP, setPlayerHP] = useState(100);
  const [currentEnemyIndex, setCurrentEnemyIndex] = useState(0);
  const [enemyHP, setEnemyHP] = useState(100);
  const [enemyProgress, setEnemyProgress] = useState(0); 

  // Load high scores when returning to the Menu
  useEffect(() => {
    if (currentScreen === 'Menu') {
      const fetchHighScores = async () => {
        try {
          const storedRpg = await AsyncStorage.getItem('@rapid_type_highscore');
          const storedStandard = await AsyncStorage.getItem('@rapid_type_highscore_standard');
          
          if (storedRpg !== null) setHighScoreRpg(parseInt(storedRpg, 10));
          if (storedStandard !== null) setHighScoreStandard(parseInt(storedStandard, 10));
        } catch (e) {
          console.error("Failed to load high scores.");
        }
      };
      fetchHighScores();
    }
  }, [currentScreen]);

  // --- Adaptive Difficulty Calculation (RPG Only) ---
  const getEnemySpeedMs = () => {
    const effectiveHighScore = Math.max(highScoreRpg, 40); 
    const targetWPM = effectiveHighScore * DIFFICULTIES[difficulty].percent;
    return Math.floor(12000 / targetWPM);
  };

  // --- 1. Enemy Ghost Typing Loop (RPG Only) ---
  useEffect(() => {
    let timeout;
    let interval; 
    
    if (gameMode === 'RPG' && currentScreen === 'Game' && targetSentence.length > 0 && !isTransitioning && !isLoadingText && hasStartedTyping) {
      const speedMs = getEnemySpeedMs();
      
      timeout = setTimeout(() => {
        interval = setInterval(() => {
          setEnemyProgress((prev) => {
            if (prev < targetSentence.length) return prev + 1; 
            return prev; 
          });
        }, speedMs);
      }, 250); 
    }
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [currentScreen, targetSentence, difficulty, isTransitioning, isLoadingText, hasStartedTyping, highScoreRpg, gameMode]);

  // --- 2. Enemy Damage Watcher (RPG Only) ---
  useEffect(() => {
    if (gameMode === 'RPG' && currentScreen === 'Game' && !isTransitioning && !isLoadingText && enemyProgress > 0 && enemyProgress <= targetSentence.length) {
      if (enemyProgress > inputText.length) {
        setPlayerHP((prevHP) => Math.max(0, prevHP - 1));
      }
    }
  }, [enemyProgress, currentScreen, inputText.length, isTransitioning, isLoadingText, gameMode]);

  // --- 3. Player Death Watcher (RPG Only) ---
  useEffect(() => {
    if (gameMode === 'RPG' && playerHP <= 0 && currentScreen === 'Game') {
      handleLoss();
    }
  }, [playerHP, currentScreen, gameMode]);

  // --- Auto-Scrolling Tracker ---
  useEffect(() => {
    if (textLines.length > 0 && scrollViewRef.current) {
      let charCount = 0;
      let activeLineIndex = 0;

      // Accurately map the player's cursor position to the calculated text lines
      for (let i = 0; i < textLines.length; i++) {
        charCount += textLines[i].text.length;
        if (inputText.length < charCount || i === textLines.length - 1) {
          activeLineIndex = i;
          break;
        }
      }

      const lineHeight = 38; // Must exactly match styles.targetSentenceBox.lineHeight
      const viewHeight = 120; // Must exactly match styles.scrollableSentenceWrapper.height
      
      // LOOK AHEAD LOGIC: Target the *next* line to ensure it is visible,
      // unless we are already on the very last line of the text.
      const targetLineIndex = Math.min(activeLineIndex + 1, textLines.length - 1);
      
      // Calculate where the bottom of the target (next) line sits on the Y axis
      const lineBottom = (targetLineIndex + 1) * lineHeight;

      // Scroll perfectly so the *next* line rests at the bottom of the view
      if (lineBottom > viewHeight) {
        scrollViewRef.current.scrollTo({ y: lineBottom - viewHeight, animated: true });
      } else {
        scrollViewRef.current.scrollTo({ y: 0, animated: true });
      }
    }
  }, [inputText, textLines]);

  const onTextLayout = (e) => {
    setTextLines(e.nativeEvent.lines);
  };

  // --- API Fetch Logic ---
  const fetchTargetText = async () => {
    setIsLoadingText(true);
    setTargetSentence(''); 
    setInputText('');
    setMaxCorrectChars(0); 
    setEnemyProgress(0);
    setHasStartedTyping(false);
    setTextLines([]); 
    trackingStats.current.sentenceStartTime = null;

    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: false });
    }

    let newText = "";

    try {
      if (exerciseType === 'Sentences') {
        const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        newText = data.text.trim();
      } else {
        if (commonWordsCache.current.length === 0) {
          const response = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt');
          if (!response.ok) throw new Error('Network response was not ok');
          const text = await response.text();
          commonWordsCache.current = text.split('\n').filter(word => word.trim().length > 0);
        }
        
        const selectedWords = [];
        for (let i = 0; i < 7; i++) {
          const randomIndex = Math.floor(Math.random() * commonWordsCache.current.length);
          selectedWords.push(commonWordsCache.current[randomIndex]);
        }
        newText = selectedWords.join(' ').trim();
      }
    } catch (error) {
      console.warn("API fetch failed. Falling back to local data.", error);
      
      if (exerciseType === 'Sentences') {
        newText = FALLBACK_SENTENCES[Math.floor(Math.random() * FALLBACK_SENTENCES.length)];
      } else {
        const shuffled = [...FALLBACK_WORDS].sort(() => 0.5 - Math.random());
        newText = shuffled.slice(0, 7).join(' ');
      }
    }

    setTargetSentence(newText);
    setIsLoadingText(false);
  };

  // --- Actions ---
  const startGame = async () => {
    if (gameMode === 'RPG') {
      setPlayerHP(100);
      setCurrentEnemyIndex(0);
      setEnemyHP(ENEMIES[0].maxHP);
    }
    
    setIsTransitioning(false);
    trackingStats.current = {
      cumulativeTimeMs: 0,
      totalWordsTyped: 0,
      sentenceStartTime: null
    };
    
    setCurrentScreen('Game');
    await fetchTargetText(); 
  };

  const accumulateStats = (finalText) => {
    if (trackingStats.current.sentenceStartTime) {
      const timeSpentMs = Date.now() - trackingStats.current.sentenceStartTime;
      trackingStats.current.cumulativeTimeMs += timeSpentMs;
      trackingStats.current.totalWordsTyped += (finalText.length / 5);
      trackingStats.current.sentenceStartTime = null; 
    }
  };

  const handleTextChange = (text) => { 
    if (isTransitioning || isLoadingText) return; 

    if (!trackingStats.current.sentenceStartTime) {
      trackingStats.current.sentenceStartTime = Date.now();
    }

    if (!hasStartedTyping) {
      setHasStartedTyping(true);
    }

    setInputText(text);

    // --- STANDARD MODE LOGIC ---
    if (gameMode === 'Standard') {
      const isComplete = allowErrors ? text.length >= targetSentence.length : text === targetSentence;
      if (isComplete) {
        handleStandardWin(text);
      }
      return;
    }

    // --- RPG MODE LOGIC ---
    let currentCorrectCount = 0;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === targetSentence[i]) {
        currentCorrectCount++;
      }
    }

    let newHP = enemyHP;

    if (currentCorrectCount > maxCorrectChars) {
      const charsAdded = currentCorrectCount - maxCorrectChars;
      setMaxCorrectChars(currentCorrectCount);
      
      newHP = enemyHP - (charsAdded * 2); 
      setEnemyHP(newHP); 
    }

    if (newHP <= 0) {
      handleEnemyDefeat(text);
    } else {
      const isComplete = allowErrors ? text.length >= targetSentence.length : text === targetSentence;
      if (isComplete) {
        accumulateStats(text);
        fetchTargetText(); 
      }
    }
  };

  const handleStandardWin = async (finalText) => {
    accumulateStats(finalText);
    
    const totalMinutes = trackingStats.current.cumulativeTimeMs / 60000;
    const wpm = totalMinutes > 0 ? Math.round(trackingStats.current.totalWordsTyped / totalMinutes) : 0;

    let message = `Speed: ${wpm} WPM`;

    try {
      if (wpm > highScoreStandard) {
        await AsyncStorage.setItem('@rapid_type_highscore_standard', wpm.toString());
        setHighScoreStandard(wpm);
        message += "\n\n🎉 NEW HIGH SCORE! 🎉";
      }
    } catch (e) {
      console.error("Failed to save standard score.");
    }

    Alert.alert(
      "Exercise Complete!",
      message,
      [{ text: "Awesome", onPress: () => setCurrentScreen('Menu') }],
      { cancelable: false }
    );
  };

  const handleEnemyDefeat = (finalText) => {
    accumulateStats(finalText); 

    setIsTransitioning(true);
    setTransitionMessage(`${ENEMIES[currentEnemyIndex].name} Defeated!`);
    
    const healAmount = DIFFICULTIES[difficulty].healOnKill;
    setPlayerHP((prev) => Math.min(100, prev + healAmount));

    setTimeout(async () => {
      if (currentEnemyIndex + 1 < ENEMIES.length) {
        const nextIndex = currentEnemyIndex + 1;
        setCurrentEnemyIndex(nextIndex);
        setEnemyHP(ENEMIES[nextIndex].maxHP);
        await fetchTargetText(); 
        setIsTransitioning(false);
      } else {
        setIsTransitioning(false);
        handleRpgWin();
      }
    }, 1500);
  };

  const handleLoss = () => {
    setCurrentScreen('Menu');
    Alert.alert(
      "Game Over",
      `The ${ENEMIES[currentEnemyIndex].name} defeated you!`,
      [{ text: "Try Again" }],
      { cancelable: false }
    );
  };

  const handleRpgWin = async () => {
    const totalMinutes = trackingStats.current.cumulativeTimeMs / 60000;
    const wpm = totalMinutes > 0 ? Math.round(trackingStats.current.totalWordsTyped / totalMinutes) : 0;

    let message = `You defeated all monsters!\nSpeed: ${wpm} WPM\nDifficulty: ${difficulty}`;

    try {
      if (wpm > highScoreRpg) {
        await AsyncStorage.setItem('@rapid_type_highscore', wpm.toString());
        setHighScoreRpg(wpm);
        message += "\n\n🎉 NEW HIGH SCORE! 🎉";
      }
    } catch (e) {
      console.error("Failed to save RPG score.");
    }

    Alert.alert(
      "Victory!",
      message,
      [{ text: "Awesome", onPress: () => setCurrentScreen('Menu') }],
      { cancelable: false }
    );
  };

  // --- Render Helpers ---
  const renderHealthBar = (name, current, max, isEnemy) => { 
    const healthPercentage = Math.max(0, (current / max) * 100);
    const barColor = isEnemy ? '#F44336' : '#4CAF50'; 

    return (
      <View style={styles.healthContainer}>
        <View style={styles.healthHeader}>
          <Text style={styles.healthText}>{name}</Text>
          <Text style={styles.healthText}>{Math.floor(current)} / {max} HP</Text>
        </View>
        <View style={styles.healthBarBackground}>
          <View style={[styles.healthBarFill, { width: `${healthPercentage}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    );
  };

  const renderTargetText = () => {
    if (isLoadingText) {
      return (
        <View style={styles.scrollableSentenceWrapper}>
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color="#222" />
            <Text style={styles.loadingText}>Fetching next {exerciseType.toLowerCase()}...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.scrollableSentenceWrapper}>
        {/* HIDDEN MEASUREMENT TEXT: 
            This plain text invisible element is strictly required to reliably 
            calculate line wrapping, as onTextLayout often fails on nested <Text> nodes. */}
        <Text 
          style={[styles.targetSentenceBox, { position: 'absolute', opacity: 0, width: '100%' }]}
          onTextLayout={onTextLayout}
          pointerEvents="none"
        >
          {targetSentence}
        </Text>

        <ScrollView
          ref={scrollViewRef}
          style={{ width: '100%', height: '100%' }}
          contentContainerStyle={{ paddingVertical: 0 }} 
          showsVerticalScrollIndicator={false}
          scrollEnabled={false} 
        >
          <Text style={styles.targetSentenceBox}>
            {targetSentence.split('').map((char, index) => {
              let color = '#888'; 
              let backgroundColor = 'transparent';
              
              const isPlayerTyped = index < inputText.length;
              const isPlayerCorrect = isPlayerTyped && inputText[index] === char;
              const isPlayerWrong = isPlayerTyped && !isPlayerCorrect;
              
              const isEnemyTyped = gameMode === 'RPG' && index < enemyProgress;

              if (isPlayerCorrect) {
                color = '#4CAF50'; 
              } else if (isPlayerWrong) {
                color = '#FFF';
                backgroundColor = '#F44336'; 
              } else if (isEnemyTyped && !isPlayerTyped) {
                color = '#D32F2F'; 
                backgroundColor = '#FFEBEE'; 
              }

              return (
                <Text key={index} style={{ color, backgroundColor }}>
                  {char}
                </Text>
              );
            })}
          </Text>
        </ScrollView>
      </View>
    );
  };

  const renderTransition = () => {
    return (
      <View style={styles.scrollableSentenceWrapper}>
        <View style={styles.loadingWrapper}>
          <Text style={styles.transitionText}>{transitionMessage}</Text>
          <Text style={styles.healText}>+ {DIFFICULTIES[difficulty].healOnKill} HP</Text>
        </View>
      </View>
    );
  };

  // --- Screen Renders ---
  if (currentScreen === 'Menu') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.menuContent}>
          <Text style={styles.title}>RAPID TYPE</Text>
          
          <Text style={styles.sectionLabel}>Game Mode</Text>
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleButton, gameMode === 'RPG' && styles.toggleButtonActive]}
              onPress={() => setGameMode('RPG')}
            >
              <Text style={[styles.toggleButtonText, gameMode === 'RPG' && styles.toggleButtonTextActive]}>RPG Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toggleButton, gameMode === 'Standard' && styles.toggleButtonActive]}
              onPress={() => setGameMode('Standard')}
            >
              <Text style={[styles.toggleButtonText, gameMode === 'Standard' && styles.toggleButtonTextActive]}>Standard</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Exercise Type</Text>
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleButton, exerciseType === 'Sentences' && styles.toggleButtonActive]}
              onPress={() => setExerciseType('Sentences')}
            >
              <Text style={[styles.toggleButtonText, exerciseType === 'Sentences' && styles.toggleButtonTextActive]}>Sentences</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toggleButton, exerciseType === 'Words' && styles.toggleButtonActive]}
              onPress={() => setExerciseType('Words')}
            >
              <Text style={[styles.toggleButtonText, exerciseType === 'Words' && styles.toggleButtonTextActive]}>Random Words</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.scoreText}>
            High Score ({gameMode}): {gameMode === 'RPG' ? highScoreRpg : highScoreStandard} WPM
          </Text>
          
          {gameMode === 'RPG' && (
            <>
              <Text style={styles.sectionLabel}>RPG Difficulty:</Text>
              <View style={styles.difficultyContainer}>
                {['Easy', 'Normal', 'Hard'].map((diff) => (
                  <TouchableOpacity
                    key={diff}
                    style={[styles.diffButton, difficulty === diff && styles.diffButtonActive]}
                    onPress={() => setDifficulty(diff)}
                  >
                    <Text style={[styles.diffButtonText, difficulty === diff && styles.diffButtonTextActive]}>
                      {diff}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>START</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.modeButton} 
            onPress={() => setAllowErrors(!allowErrors)}
          >
            <Text style={styles.modeButtonText}>
              Rules: {allowErrors ? 'Forgiving (Allows Typos)' : 'Perfect (Strict)'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoider} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.gameContent}>
          
          {gameMode === 'RPG' && (
            <View style={styles.rpgUI}>
              {renderHealthBar(ENEMIES[currentEnemyIndex].name, enemyHP, ENEMIES[currentEnemyIndex].maxHP, true)}
              <Text style={styles.vsText}>VS</Text>
              {renderHealthBar("Player 🤺", playerHP, 100, false)}
            </View>
          )}

          {gameMode === 'Standard' && (
            <View style={styles.standardHeader}>
              <Text style={styles.standardModeTitle}>Standard Mode</Text>
              <Text style={styles.standardModeSubtitle}>Type as fast as you can!</Text>
            </View>
          )}

          <View style={styles.typingArea}>
            {isTransitioning ? renderTransition() : renderTargetText()}
            
            <TextInput
              style={[styles.input, (isTransitioning || isLoadingText) && styles.inputDisabled]}
              placeholder={(isTransitioning || isLoadingText) ? "Get ready..." : "Type here..."}
              value={(isTransitioning || isLoadingText) ? '' : inputText}
              onChangeText={handleTextChange}
              autoFocus={true}
              autoCorrect={false}
              autoCapitalize="none"
              editable={!isTransitioning && !isLoadingText} 
              maxLength={allowErrors && !isLoadingText ? targetSentence.length : undefined} 
            />
          </View>

          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={() => setCurrentScreen('Menu')}
          >
            <Text style={styles.cancelButtonText}>Quit</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  keyboardAvoider: {
    flex: 1,
  },
  menuContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: '#222',
    letterSpacing: 1,
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#E0E0E0',
    borderRadius: 25,
    marginBottom: 20,
    padding: 5,
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  toggleButtonActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#888',
  },
  toggleButtonTextActive: {
    color: '#222',
  },
  scoreText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
    marginBottom: 20,
  },
  difficultyContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    gap: 10,
  },
  diffButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
  },
  diffButtonActive: {
    borderColor: '#222',
    backgroundColor: '#222',
  },
  diffButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555',
  },
  diffButtonTextActive: {
    color: '#FFF',
  },
  startButton: {
    backgroundColor: '#222',
    paddingVertical: 15,
    paddingHorizontal: 50,
    borderRadius: 30,
    elevation: 3, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginBottom: 20,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  modeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#CCC',
  },
  modeButtonText: {
    color: '#555',
    fontSize: 14,
    fontWeight: 'bold',
  },
  gameContent: {
    flex: 1,
    justifyContent: 'flex-start', 
    padding: 20,
    paddingTop: '10%', 
  },
  rpgUI: {
    width: '100%',
    marginBottom: 40, 
  },
  standardHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
    paddingVertical: 20,
  },
  standardModeTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#333',
  },
  standardModeSubtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 5,
  },
  healthContainer: {
    marginBottom: 10,
  },
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  healthText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  healthBarBackground: {
    height: 20,
    backgroundColor: '#DDD',
    borderRadius: 10,
    overflow: 'hidden',
  },
  healthBarFill: {
    height: '100%',
  },
  vsText: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
    color: '#888',
    marginVertical: 5,
  },
  typingArea: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20, 
  },
  scrollableSentenceWrapper: {
    height: 120,
    width: '100%',
    marginBottom: 20,
    position: 'relative', 
    overflow: 'hidden',
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetSentenceBox: {
    fontSize: 26,
    fontWeight: 'bold',
    lineHeight: 38,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#888',
    fontWeight: 'bold',
  },
  transitionText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#222',
    textAlign: 'center',
    marginBottom: 10,
  },
  healText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#4CAF50', 
  },
  input: {
    width: '100%',
    height: 60,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#CCC',
    borderRadius: 10,
    paddingHorizontal: 20,
    fontSize: 20,
    marginBottom: 10,
    elevation: 1,
  },
  inputDisabled: {
    backgroundColor: '#EEEEEE',
    borderColor: '#DDDDDD',
    color: '#999',
  },
  cancelButton: {
    padding: 15,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#F44336',
    fontSize: 18,
    fontWeight: '600',
  },
});

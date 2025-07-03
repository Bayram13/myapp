import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert, // Basit bildirimler için Alert kullanıldı
  Switch, // Checkbox yerine Switch kullanıldı
  Platform // Platforma özel ayarlamalar için
} from 'react-native';
import { initializeApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage'; // localStorage yerine

// Firebase yapılandırması (web'den farklı olabilir, bu sadece bir örnek)
// Gerçek uygulamanızda bu değerleri Firebase projenizden almalısınız.
const firebaseConfig = {
  // Bu kısım genellikle React Native Firebase modülleri tarafından otomatik olarak yönetilir,
  // ancak manuel olarak başlatmanız gerekirse buraya ekleyebilirsiniz.
  // Örneğin: projectId, appId, apiKey vb.
};

// Firebase uygulamasını başlat (eğer zaten başlatılmamışsa)
// Eğer @react-native-firebase/app otomatik olarak başlatıyorsa bu satıra gerek kalmayabilir.
if (!firestore().app) { // firestore().app ile uygulamanın başlatılıp başlatılmadığını kontrol et
  initializeApp(firebaseConfig);
}

function App() {
  const [notes, setNotes] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [alarmDateTime, setAlarmDateTime] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showAlarmInput, setShowAlarmInput] = useState(false);

  const [userName, setUserName] = useState('');
  const [theme, setTheme] = useState('light'); // 'light', 'dark', 'special'
  const [showSettings, setShowSettings] = useState(false);

  const [activeTab, setActiveTab] = useState('all'); // 'all' veya 'groups'
  const [searchQuery, setSearchQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [showAddNotesToGroupModal, setShowAddNotesToGroupModal] = useState(false);
  const [selectedNotesForGroupAdd, setSelectedNotesForGroupAdd] = useState([]);
  const [selectedGroupsForNewNote, setSelectedGroupsForNewNote] = useState([]);

  // Mesaj kutusu için state'ler (React Native Alert kullanıldığı için daha basit)
  const showMessageBoxFunc = (content) => {
    Alert.alert("Bilgi", content);
  };

  // Tarih ve saat formatını kontrol et
  const isValidDateTimeFormat = (dateTimeString) => {
    // YYYY-MM-DDTHH:MM formatını kontrol eden basit bir regex
    const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    return regex.test(dateTimeString);
  };

  // Firebase ve kullanıcı yetkilendirmesini başlat
  useEffect(() => {
    const initializeUser = async () => {
      try {
        // __app_id ve __initial_auth_token global değişkenlerini kontrol et
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // React Native Firebase'de signInWithCustomToken kullanımı farklı olabilir,
        // genellikle doğrudan auth().signInAnonymously() veya diğer metotlar kullanılır.
        // Bu örnekte anonim giriş tercih edildi.
        let currentUser = auth().currentUser;
        if (!currentUser) {
          await auth().signInAnonymously();
          currentUser = auth().currentUser;
        }
        setUserId(currentUser?.uid || 'default-user-id');
        setIsAuthReady(true);
      } catch (error) {
        console.error("Firebase yetkilendirme hatası:", error);
        setUserId('default-user-id'); // Hata durumunda varsayılan ID
        setIsAuthReady(true);
      }
    };

    initializeUser();

    // Kullanıcı adı ve tema ayarlarını AsyncStorage'dan yükle
    const loadSettings = async () => {
      try {
        const storedUserName = await AsyncStorage.getItem('userName');
        if (storedUserName) setUserName(storedUserName);
        const storedTheme = await AsyncStorage.getItem('theme');
        if (storedTheme) setTheme(storedTheme);
      } catch (e) {
        console.error("Ayarlar yüklenirken hata oluştu:", e);
      }
    };
    loadSettings();

  }, []);

  // Notları ve grupları Firestore'dan çek
  useEffect(() => {
    if (firestore().app && userId && isAuthReady) {
      const notesCollectionRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`);
      const unsubscribeNotes = notesCollectionRef.orderBy('timestamp', 'desc').onSnapshot(
        (snapshot) => {
          const fetchedNotes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            groupIds: doc.data().groupIds || []
          }));
          setNotes(fetchedNotes);

          // Mevcut alarmları temizle ve yeniden ayarla
          Object.values(activeAlarms).forEach(timeoutId => clearTimeout(timeoutId));
          const newActiveAlarms = {};
          fetchedNotes.forEach(note => {
            if (note.alarmTimestamp) {
              const alarmDate = note.alarmTimestamp.toDate();
              const now = new Date();
              if (alarmDate > now) {
                const delay = alarmDate.getTime() - now.getTime();
                const timeoutId = setTimeout(() => {
                  showMessageBoxFunc(`Alarm! Not: "${note.title}"`);
                  setActiveAlarms(prev => {
                    const newState = { ...prev };
                    delete newState[note.id];
                    return newState;
                  });
                }, delay);
                newActiveAlarms[note.id] = timeoutId;
              }
            }
          });
          setActiveAlarms(newActiveAlarms);
        },
        (error) => {
          console.error("Notları çekerken hata oluştu:", error);
        }
      );

      const groupsCollectionRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`);
      const unsubscribeGroups = groupsCollectionRef.orderBy('timestamp', 'desc').onSnapshot(
        (snapshot) => {
          const fetchedGroups = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            noteIds: doc.data().noteIds || []
          }));
          setGroups(fetchedGroups);
        },
        (error) => {
          console.error("Grupları çekerken hata oluştu:", error);
        }
      );

      return () => {
        unsubscribeNotes();
        unsubscribeGroups();
        Object.values(activeAlarms).forEach(timeoutId => clearTimeout(timeoutId));
      };
    }
  }, [userId, isAuthReady]); // firestore().app'i bağımlılıklara eklemeye gerek yok, çünkü o bir singleton

  const handleSaveNote = async () => {
    if (!firestore().app || !userId) {
      showMessageBoxFunc("Veritabanı veya kullanıcı ID'si mevcut değil.");
      return;
    }
    if (newNoteTitle.trim() === '' || newNoteContent.trim() === '') {
      showMessageBoxFunc('Başlık ve içerik boş olamaz!');
      return;
    }

    let alarmTimestamp = null;
    if (showAlarmInput && alarmDateTime) {
      if (!isValidDateTimeFormat(alarmDateTime)) {
        showMessageBoxFunc('Geçersiz alarm tarihi veya saati formatı! (YYYY-MM-DDTHH:MM)');
        return;
      }
      const selectedDate = new Date(alarmDateTime);
      alarmTimestamp = firestore.Timestamp.fromDate(selectedDate);
    }

    try {
      if (editingNoteId) {
        const noteRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`).doc(editingNoteId);
        await noteRef.update({
          title: newNoteTitle,
          content: newNoteContent,
          timestamp: firestore.Timestamp.now(),
          alarmTimestamp: alarmTimestamp,
          groupIds: selectedGroupsForNewNote
        });

        const oldNote = notes.find(n => n.id === editingNoteId);
        const oldGroupIds = oldNote ? oldNote.groupIds : [];

        const addedGroups = selectedGroupsForNewNote.filter(groupId => !oldGroupIds.includes(groupId));
        for (const groupId of addedGroups) {
          const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(groupId);
          await groupRef.update({
            noteIds: firestore.FieldValue.arrayUnion(editingNoteId)
          });
        }

        const removedGroups = oldGroupIds.filter(groupId => !selectedGroupsForNewNote.includes(groupId));
        for (const groupId of removedGroups) {
          const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(groupId);
          await groupRef.update({
            noteIds: firestore.FieldValue.arrayRemove(editingNoteId)
          });
        }

        showMessageBoxFunc('Not başarıyla güncellendi!');
      } else {
        const notesCollectionRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`);
        const newNoteRef = await notesCollectionRef.add({
          title: newNoteTitle,
          content: newNoteContent,
          timestamp: firestore.Timestamp.now(),
          alarmTimestamp: alarmTimestamp,
          groupIds: selectedGroupsForNewNote
        });

        for (const groupId of selectedGroupsForNewNote) {
          const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(groupId);
          await groupRef.update({
            noteIds: firestore.FieldValue.arrayUnion(newNoteRef.id)
          });
        }
        showMessageBoxFunc('Not başarıyla eklendi!');
      }
      setEditingNoteId(null);
      setNewNoteTitle('');
      setNewNoteContent('');
      setAlarmDateTime('');
      setShowNoteForm(false);
      setShowAlarmInput(false);
      setSelectedGroupsForNewNote([]);
    } catch (error) {
      console.error("Not kaydedilirken hata oluştu:", error);
      showMessageBoxFunc('Not kaydedilirken bir hata oluştu.');
    }
  };

  const handleEditClick = (note) => {
    setEditingNoteId(note.id);
    setNewNoteTitle(note.title);
    setNewNoteContent(note.content);
    if (note.alarmTimestamp) {
      // Alarm zamanını YYYY-MM-DDTHH:MM formatına dönüştür
      const date = note.alarmTimestamp.toDate();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      setAlarmDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
      setShowAlarmInput(true);
    } else {
      setAlarmDateTime('');
      setShowAlarmInput(false);
    }
    setSelectedGroupsForNewNote(note.groupIds || []);
    setShowNoteForm(true);
  };

  const handleDeleteNote = (id) => {
    Alert.alert(
      "Onay",
      "Bu notu silmek istediğinizden emin misiniz?",
      [
        { text: "Hayır", style: "cancel" },
        {
          text: "Evet",
          onPress: async () => {
            if (!firestore().app || !userId) {
              showMessageBoxFunc("Veritabanı veya kullanıcı ID'si mevcut değil.");
              return;
            }
            try {
              const noteRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`).doc(id);
              await noteRef.delete();

              if (activeAlarms[id]) {
                clearTimeout(activeAlarms[id]);
                setActiveAlarms(prev => {
                  const newState = { ...prev };
                  delete newState[id];
                  return newState;
                });
              }

              const noteToDelete = notes.find(n => n.id === id);
              if (noteToDelete && noteToDelete.groupIds) {
                for (const groupId of noteToDelete.groupIds) {
                  const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(groupId);
                  await groupRef.update({
                    noteIds: firestore.FieldValue.arrayRemove(id)
                  });
                }
              }
              showMessageBoxFunc('Not başarıyla silindi!');
            } catch (error) {
              console.error("Not silinirken hata oluştu:", error);
              showMessageBoxFunc('Not silinirken bir hata oluştu.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const truncateContent = (content, limit) => {
    if (content.length <= limit) {
      return content;
    }
    return content.substring(0, limit) + '...';
  };

  const handleNewNoteClick = () => {
    setEditingNoteId(null);
    setNewNoteTitle('');
    setNewNoteContent('');
    setAlarmDateTime('');
    setSelectedGroupsForNewNote([]);
    setShowNoteForm(true);
    setShowAlarmInput(false);
  };

  const handleUserNameChange = (text) => {
    setUserName(text);
  };

  const handleSaveUserName = async () => {
    try {
      await AsyncStorage.setItem('userName', userName);
      showMessageBoxFunc('Adınız başarıyla kaydedildi!');
    } catch (e) {
      console.error("Kullanıcı adı kaydedilirken hata oluştu:", e);
      showMessageBoxFunc('Kullanıcı adı kaydedilirken bir hata oluştu.');
    }
  };

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem('theme', newTheme);
    } catch (e) {
      console.error("Tema kaydedilirken hata oluştu:", e);
    }
  };

  const handleSaveGroup = async () => {
    if (!firestore().app || !userId) {
      showMessageBoxFunc("Veritabanı veya kullanıcı ID'si mevcut değil.");
      return;
    }
    if (groupNameInput.trim() === '') {
      showMessageBoxFunc('Grup adı boş olamaz!');
      return;
    }

    try {
      if (editingGroup) {
        const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(editingGroup.id);
        await groupRef.update({
          name: groupNameInput,
          timestamp: firestore.Timestamp.now()
        });
        showMessageBoxFunc('Grup başarıyla güncellendi!');
      } else {
        const groupsCollectionRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`);
        await groupsCollectionRef.add({
          name: groupNameInput,
          noteIds: [],
          timestamp: firestore.Timestamp.now()
        });
        showMessageBoxFunc('Grup başarıyla oluşturuldu!');
      }
      setShowGroupModal(false);
      setGroupNameInput('');
      setEditingGroup(null);
    } catch (error) {
      console.error("Grup kaydedilirken hata oluştu:", error);
      showMessageBoxFunc('Grup kaydedilirken bir hata oluştu.');
    }
  };

  const handleEditGroupClick = (group) => {
    setEditingGroup(group);
    setGroupNameInput(group.name);
    setShowGroupModal(true);
  };

  const handleDeleteGroup = (groupId) => {
    Alert.alert(
      "Onay",
      "Bu grubu silmek istediğinizden emin misiniz? Grubun içindeki notlar silinmeyecektir.",
      [
        { text: "Hayır", style: "cancel" },
        {
          text: "Evet",
          onPress: async () => {
            if (!firestore().app || !userId) {
              showMessageBoxFunc("Veritabanı veya kullanıcı ID'si mevcut değil.");
              return;
            }
            try {
              const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(groupId);
              await groupRef.delete();

              const notesInGroup = notes.filter(note => note.groupIds && note.groupIds.includes(groupId));
              for (const note of notesInGroup) {
                const noteRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`).doc(note.id);
                await noteRef.update({
                  groupIds: firestore.FieldValue.arrayRemove(groupId)
                });
              }
              showMessageBoxFunc('Grup başarıyla silindi!');
            } catch (error) {
              console.error("Grup silinirken hata oluştu:", error);
              showMessageBoxFunc('Grup silinirken bir hata oluştu.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleAddNotesToGroupClick = (group) => {
    setEditingGroup(group);
    setSelectedNotesForGroupAdd(group.noteIds || []);
    setShowAddNotesToGroupModal(true);
  };

  const handleToggleNoteSelectionForGroup = (noteId) => {
    setSelectedNotesForGroupAdd(prev => {
      if (prev.includes(noteId)) {
        return prev.filter(id => id !== noteId);
      } else {
        return [...prev, noteId];
      }
    });
  };

  const handleSaveNotesToGroup = async () => {
    if (!firestore().app || !userId || !editingGroup) {
      showMessageBoxFunc("Veritabanı, kullanıcı ID'si veya düzenlenecek grup mevcut değil.");
      return;
    }

    try {
      const groupRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/groups`).doc(editingGroup.id);
      const oldNoteIdsInGroup = editingGroup.noteIds || [];

      const notesToAdd = selectedNotesForGroupAdd.filter(noteId => !oldNoteIdsInGroup.includes(noteId));
      for (const noteId of notesToAdd) {
        const noteRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`).doc(noteId);
        await noteRef.update({
          groupIds: firestore.FieldValue.arrayUnion(editingGroup.id)
        });
      }

      const notesToRemove = oldNoteIdsInGroup.filter(noteId => !selectedNotesForGroupAdd.includes(noteId));
      for (const noteId of notesToRemove) {
        const noteRef = firestore().collection(`artifacts/${__app_id}/users/${userId}/notes`).doc(noteId);
        await noteRef.update({
          groupIds: firestore.FieldValue.arrayRemove(editingGroup.id)
        });
      }

      await groupRef.update({
        noteIds: selectedNotesForGroupAdd
      });

      setShowAddNotesToGroupModal(false);
      setSelectedNotesForGroupAdd([]);
      setEditingGroup(null);
      showMessageBoxFunc('Notlar gruba başarıyla eklendi/güncellendi!');
    } catch (error) {
      console.error("Notlar gruba kaydedilirken hata oluştu:", error);
      showMessageBoxFunc('Notlar gruba kaydedilirken bir hata oluştu.');
    }
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const notesForGroupAddition = notes.filter(note =>
    editingGroup && !editingGroup.noteIds.includes(note.id)
  );

  if (!isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const currentTheme = theme === 'dark' ? darkTheme : theme === 'special' ? specialTheme : lightTheme;

  return (
    <View style={[styles.container, currentTheme.container]}>
      {/* Yeni Not Ekle butonu */}
      <TouchableOpacity
        style={[styles.newNoteButton, currentTheme.newNoteButton]}
        onPress={handleNewNoteClick}
      >
        <Text style={styles.buttonText}>Yeni Not Ekle</Text>
      </TouchableOpacity>

      {/* Ayarlar butonu */}
      <TouchableOpacity
        style={[styles.settingsButton, currentTheme.settingsButton]}
        onPress={() => setShowSettings(true)}
      >
        <Text style={styles.buttonText}>Ayarlar</Text>
      </TouchableOpacity>

      {/* Merhaba Kullanıcı Adı */}
      <Text style={[styles.greetingText, currentTheme.greetingText]}>
        Merhaba {userName || 'Misafir'}
      </Text>

      {/* Başlık */}
      <Text style={[styles.mainTitle, currentTheme.mainTitle]}>
        Günlük Notlarım
      </Text>

      {/* Not Ekleme/Düzenleme Formu */}
      {(showNoteForm || editingNoteId) && (
        <View style={[styles.noteFormContainer, currentTheme.cardBackground]}>
          <Text style={[styles.formTitle, currentTheme.headingText]}>
            {editingNoteId ? 'Notu Düzenle' : 'Yeni Not Ekle'}
          </Text>
          <TextInput
            style={[styles.input, currentTheme.input]}
            placeholder="Not Başlığı"
            placeholderTextColor={currentTheme.placeholderText}
            value={newNoteTitle}
            onChangeText={setNewNoteTitle}
          />
          <TextInput
            style={[styles.input, styles.textArea, currentTheme.input]}
            placeholder="Not İçeriği"
            placeholderTextColor={currentTheme.placeholderText}
            multiline
            value={newNoteContent}
            onChangeText={setNewNoteContent}
          />

          {/* Alarm Ekle Switch'i */}
          <View style={styles.checkboxContainer}>
            <Switch
              trackColor={{ false: "#767577", true: currentTheme.switchTrackColor }}
              thumbColor={showAlarmInput ? currentTheme.switchThumbColor : "#f4f3f4"}
              ios_backgroundColor="#3e3e3e"
              onValueChange={setShowAlarmInput}
              value={showAlarmInput}
            />
            <Text style={[styles.checkboxLabel, currentTheme.label]}>Alarm Ekle</Text>
          </View>

          {/* Alarm Tarihi ve Saati Girişi */}
          {showAlarmInput && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, currentTheme.label]}>Alarm Kur (YYYY-MM-DDTHH:MM):</Text>
              <TextInput
                style={[styles.input, currentTheme.input]}
                placeholder="Örn: 2024-12-31T14:30"
                placeholderTextColor={currentTheme.placeholderText}
                value={alarmDateTime}
                onChangeText={setAlarmDateTime}
              />
            </View>
          )}

          {/* Gruba Ekle Seçimi */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, currentTheme.label]}>Gruba Ekle (İsteğe Bağlı):</Text>
            {/* React Native'de çoklu seçim için özel bir bileşen veya kütüphane gerekir.
                Basitlik adına şimdilik sadece grupları listeliyoruz ve seçim mantığını koruyoruz.
                Gerçek bir uygulamada Dropdown veya Multi-Select kütüphanesi kullanılmalı. */}
            <ScrollView style={[styles.multiSelectContainer, currentTheme.input]}>
              {groups.length === 0 ? (
                <Text style={[styles.placeholderText, currentTheme.placeholderText]}>Henüz grup oluşturmadınız.</Text>
              ) : (
                groups.map(group => (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.multiSelectItem,
                      selectedGroupsForNewNote.includes(group.id) && currentTheme.multiSelectItemSelected
                    ]}
                    onPress={() => {
                      setSelectedGroupsForNewNote(prev => {
                        if (prev.includes(group.id)) {
                          return prev.filter(id => id !== group.id);
                        } else {
                          return [...prev, group.id];
                        }
                      });
                    }}
                  >
                    <Text style={currentTheme.multiSelectItemText}>{group.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[styles.button, currentTheme.primaryButton]}
            onPress={handleSaveNote}
          >
            <Text style={styles.buttonText}>
              {editingNoteId ? 'Notu Güncelle' : 'Notu Kaydet'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton, currentTheme.secondaryButton]}
            onPress={() => {
              setEditingNoteId(null);
              setNewNoteTitle('');
              setNewNoteContent('');
              setAlarmDateTime('');
              setShowNoteForm(false);
              setShowAlarmInput(false);
              setSelectedGroupsForNewNote([]);
            }}
          >
            <Text style={styles.buttonText}>İptal Et</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ana İçerik Alanı */}
      <View style={styles.mainContentArea}>
        {/* Arama Çubuğu - Sadece "Tümü" sekmesinde göster */}
        {activeTab === 'all' && (
          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.input, currentTheme.input]}
              placeholder="Notlarda ara..."
              placeholderTextColor={currentTheme.placeholderText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {/* Not Listesi / Gruplar Listesi */}
        {activeTab === 'all' && (
          <>
            <Text style={[styles.sectionTitle, currentTheme.headingText]}>
              Tüm Notlar
            </Text>
            <ScrollView style={styles.listScrollView}>
              {filteredNotes.length === 0 ? (
                <Text style={[styles.emptyListText, currentTheme.emptyListText]}>
                  {searchQuery ? 'Aradığınız kriterlere uygun not bulunamadı.' : 'Henüz hiç notunuz yok. Yeni bir not ekleyin!'}
                </Text>
              ) : (
                filteredNotes.map((note) => (
                  <View key={note.id} style={[styles.noteCard, currentTheme.cardBackground]}>
                    <Text style={[styles.noteTitle, currentTheme.headingText]}>
                      {note.title}
                    </Text>
                    <Text style={[styles.noteContent, currentTheme.bodyText]}>
                      {truncateContent(note.content, 150)}
                    </Text>
                    {note.alarmTimestamp && (
                      <Text style={[styles.noteAlarm, currentTheme.alarmText]}>
                        Alarm: {new Date(note.alarmTimestamp.toDate()).toLocaleString('tr-TR')}
                      </Text>
                    )}
                    {note.groupIds && note.groupIds.length > 0 && (
                      <Text style={[styles.noteGroups, currentTheme.secondaryText]}>
                        Gruplar: {note.groupIds.map(id => groups.find(g => g.id === id)?.name).filter(Boolean).join(', ')}
                      </Text>
                    )}
                    <Text style={[styles.noteTimestamp, currentTheme.secondaryText]}>
                      {note.timestamp ? new Date(note.timestamp.toDate()).toLocaleString('tr-TR') : 'Tarih Bilgisi Yok'}
                    </Text>
                    <View style={styles.cardButtons}>
                      <TouchableOpacity
                        style={[styles.cardButton, currentTheme.cardPrimaryButton]}
                        onPress={() => handleEditClick(note)}
                      >
                        <Text style={styles.buttonText}>Düzenle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cardButton, styles.cardDeleteButton, currentTheme.cardDeleteButton]}
                        onPress={() => handleDeleteNote(note.id)}
                      >
                        <Text style={styles.buttonText}>Sil</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </>
        )}

        {activeTab === 'groups' && (
          <>
            <Text style={[styles.sectionTitle, currentTheme.headingText]}>
              Not Grupları
            </Text>
            <TouchableOpacity
              style={[styles.button, currentTheme.groupButton]}
              onPress={() => {
                setEditingGroup(null);
                setGroupNameInput('');
                setShowGroupModal(true);
              }}
            >
              <Text style={styles.buttonText}>Yeni Grup Oluştur</Text>
            </TouchableOpacity>
            <ScrollView style={styles.listScrollView}>
              {groups.length === 0 ? (
                <Text style={[styles.emptyListText, currentTheme.emptyListText]}>
                  Henüz hiç grup oluşturmadınız.
                </Text>
              ) : (
                groups.map((group) => (
                  <View key={group.id} style={[styles.groupCard, currentTheme.cardBackground]}>
                    <Text style={[styles.groupName, currentTheme.headingText]}>
                      {group.name} ({group.noteIds.length} Not)
                    </Text>
                    <View style={styles.cardButtons}>
                      <TouchableOpacity
                        style={[styles.cardButton, currentTheme.cardPrimaryButton]}
                        onPress={() => handleAddNotesToGroupClick(group)}
                      >
                        <Text style={styles.buttonText}>Notları Ekle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cardButton, currentTheme.cardSecondaryButton]}
                        onPress={() => handleEditGroupClick(group)}
                      >
                        <Text style={styles.buttonText}>Düzenle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cardButton, styles.cardDeleteButton, currentTheme.cardDeleteButton]}
                        onPress={() => handleDeleteGroup(group.id)}
                      >
                        <Text style={styles.buttonText}>Sil</Text>
                      </TouchableOpacity>
                    </View>
                    {group.noteIds.length > 0 && (
                      <View style={[styles.groupNotesListContainer, currentTheme.groupNotesBorder]}>
                        <Text style={[styles.groupNotesListTitle, currentTheme.secondaryText]}>Bu Gruptaki Notlar:</Text>
                        {group.noteIds.map(noteId => {
                          const note = notes.find(n => n.id === noteId);
                          return note ? <Text key={note.id} style={[styles.groupNoteItem, currentTheme.bodyText]}>• {note.title}</Text> : null;
                        })}
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </>
        )}
      </View>


      {/* Ayarlar Modalı */}
      {showSettings && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, currentTheme.cardBackground]}>
            <Text style={[styles.modalTitle, currentTheme.headingText]}>Ayarlar</Text>

            {/* İsim Ayarı */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, currentTheme.label]}>Adınız:</Text>
              <View style={styles.nameInputContainer}>
                <TextInput
                  style={[styles.input, styles.flexGrow, currentTheme.input]}
                  placeholder="Adınızı girin"
                  placeholderTextColor={currentTheme.placeholderText}
                  value={userName}
                  onChangeText={handleUserNameChange}
                />
                <TouchableOpacity
                  style={[styles.saveNameButton, currentTheme.primaryButton]}
                  onPress={handleSaveUserName}
                >
                  <Text style={styles.buttonText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tema Ayarı */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, currentTheme.label]}>Tema:</Text>
              <View style={styles.themeButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.themeButton,
                    theme === 'light' ? currentTheme.primaryButton : currentTheme.secondaryButton
                  ]}
                  onPress={() => handleThemeChange('light')}
                >
                  <Text style={styles.buttonText}>Açık Tema</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.themeButton,
                    theme === 'dark' ? currentTheme.primaryButton : currentTheme.secondaryButton
                  ]}
                  onPress={() => handleThemeChange('dark')}
                >
                  <Text style={styles.buttonText}>Koyu Tema</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.themeButton,
                    theme === 'special' ? currentTheme.primaryButton : currentTheme.secondaryButton
                  ]}
                  onPress={() => handleThemeChange('special')}
                >
                  <Text style={styles.buttonText}>Özel Tema</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.cancelButton, currentTheme.cardDeleteButton]}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.buttonText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Grup Oluşturma/Düzenleme Modalı */}
      {showGroupModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, currentTheme.cardBackground]}>
            <Text style={[styles.modalTitle, currentTheme.headingText]}>
              {editingGroup ? 'Grubu Düzenle' : 'Yeni Grup Oluştur'}
            </Text>
            <TextInput
              style={[styles.input, currentTheme.input]}
              placeholder="Grup Adı"
              placeholderTextColor={currentTheme.placeholderText}
              value={groupNameInput}
              onChangeText={setGroupNameInput}
            />
            <TouchableOpacity
              style={[styles.button, currentTheme.primaryButton]}
              onPress={handleSaveGroup}
            >
              <Text style={styles.buttonText}>
                {editingGroup ? 'Grubu Güncelle' : 'Grup Oluştur'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, currentTheme.secondaryButton]}
              onPress={() => {
                setShowGroupModal(false);
                setGroupNameInput('');
                setEditingGroup(null);
              }}
            >
              <Text style={styles.buttonText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Gruba Not Ekleme Modalı */}
      {showAddNotesToGroupModal && editingGroup && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, currentTheme.cardBackground]}>
            <Text style={[styles.modalTitle, currentTheme.headingText]}>
              "{editingGroup.name}" Grubuna Not Ekle
            </Text>
            <ScrollView style={[styles.multiSelectContainer, styles.modalNotesList, currentTheme.input]}>
              {notesForGroupAddition.length === 0 && editingGroup.noteIds.length === notes.length ? (
                <Text style={[styles.emptyListText, currentTheme.emptyListText]}>Tüm notlar zaten bu grupta.</Text>
              ) : notesForGroupAddition.length === 0 && editingGroup.noteIds.length < notes.length ? (
                <Text style={[styles.emptyListText, currentTheme.emptyListText]}>Eklenecek başka not yok.</Text>
              ) : (
                notesForGroupAddition.map(note => (
                  <TouchableOpacity
                    key={note.id}
                    style={[
                      styles.multiSelectItem,
                      selectedNotesForGroupAdd.includes(note.id) && currentTheme.multiSelectItemSelected,
                      currentTheme.multiSelectItemBorder
                    ]}
                    onPress={() => handleToggleNoteSelectionForGroup(note.id)}
                  >
                    <Text style={currentTheme.multiSelectItemText}>{note.title}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.button, currentTheme.primaryButton]}
              onPress={handleSaveNotesToGroup}
            >
              <Text style={styles.buttonText}>Seçilenleri Kaydet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, currentTheme.secondaryButton]}
              onPress={() => {
                setShowAddNotesToGroupModal(false);
                setSelectedNotesForGroupAdd([]);
                setEditingGroup(null);
              }}
            >
              <Text style={styles.buttonText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Alt Sekme Çubuğu */}
      <View style={[styles.bottomTabBar, currentTheme.tabBarBackground, currentTheme.tabBarBorder]}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'all' && currentTheme.activeTabButton
          ]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'all' ? currentTheme.activeTabText : currentTheme.inactiveTabText]}>Tümü</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'groups' && currentTheme.activeTabButton
          ]}
          onPress={() => setActiveTab('groups')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'groups' ? currentTheme.activeTabText : currentTheme.inactiveTabText]}>Gruplar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Tema stilleri
const lightTheme = StyleSheet.create({
  container: { backgroundColor: '#f3f4f6' }, // gray-100
  cardBackground: { backgroundColor: '#ffffff' }, // white
  headingText: { color: '#1f2937' }, // gray-800
  bodyText: { color: '#374151' }, // gray-700
  secondaryText: { color: '#6b7280' }, // gray-500
  placeholderText: { color: '#9ca3af' }, // gray-400
  label: { color: '#374151' }, // gray-700
  input: { borderColor: '#d1d5db', backgroundColor: '#ffffff', color: '#1f2937' }, // gray-300, white, gray-900
  primaryButton: { backgroundColor: '#4f46e5' }, // indigo-600
  secondaryButton: { backgroundColor: '#9ca3af' }, // gray-400
  cardPrimaryButton: { backgroundColor: '#3b82f6' }, // blue-500
  cardSecondaryButton: { backgroundColor: '#6b7280' }, // gray-500
  cardDeleteButton: { backgroundColor: '#ef4444' }, // red-500
  newNoteButton: { backgroundColor: '#22c55e' }, // green-500
  settingsButton: { backgroundColor: '#3b82f6' }, // blue-500
  groupButton: { backgroundColor: '#9333ea' }, // purple-600
  alarmText: { color: '#eab308' }, // yellow-600
  emptyListText: { color: '#6b7280' }, // gray-600
  groupNotesBorder: { borderColor: '#e5e7eb' }, // gray-200
  multiSelectItemSelected: { backgroundColor: '#e0e7ff' }, // indigo-100
  multiSelectItemText: { color: '#1f2937' }, // gray-800
  multiSelectItemBorder: { borderColor: '#d1d5db' }, // gray-300
  tabBarBackground: { backgroundColor: '#ffffff' }, // white
  tabBarBorder: { borderColor: '#e5e7eb' }, // gray-200
  activeTabButton: { backgroundColor: '#4f46e5' }, // indigo-600
  activeTabText: { color: '#ffffff' }, // white
  inactiveTabText: { color: '#374151' }, // gray-700
  switchTrackColor: '#4f46e5', // indigo-600
  switchThumbColor: '#ffffff', // white
});

const darkTheme = StyleSheet.create({
  container: { backgroundColor: '#111827' }, // gray-900
  cardBackground: { backgroundColor: '#1f2937' }, // gray-800
  headingText: { color: '#f9fafb' }, // gray-100
  bodyText: { color: '#d1d5db' }, // gray-300
  secondaryText: { color: '#9ca3af' }, // gray-400
  placeholderText: { color: '#6b7280' }, // gray-500
  label: { color: '#d1d5db' }, // gray-300
  input: { borderColor: '#4b5563', backgroundColor: '#374151', color: '#f9fafb' }, // gray-600, gray-700, gray-100
  primaryButton: { backgroundColor: '#4338ca' }, // indigo-700
  secondaryButton: { backgroundColor: '#4b5563' }, // gray-600
  cardPrimaryButton: { backgroundColor: '#2563eb' }, // blue-600
  cardSecondaryButton: { backgroundColor: '#4b5563' }, // gray-600
  cardDeleteButton: { backgroundColor: '#dc2626' }, // red-600
  newNoteButton: { backgroundColor: '#16a34a' }, // green-700
  settingsButton: { backgroundColor: '#2563eb' }, // blue-600
  groupButton: { backgroundColor: '#7e22ce' }, // purple-700
  alarmText: { color: '#facc15' }, // yellow-400
  emptyListText: { color: '#9ca3af' }, // gray-400
  groupNotesBorder: { borderColor: '#374151' }, // gray-700
  multiSelectItemSelected: { backgroundColor: '#4338ca' }, // indigo-700
  multiSelectItemText: { color: '#f9fafb' }, // gray-100
  multiSelectItemBorder: { borderColor: '#4b5563' }, // gray-600
  tabBarBackground: { backgroundColor: '#1f2937' }, // gray-800
  tabBarBorder: { borderColor: '#374151' }, // gray-700
  activeTabButton: { backgroundColor: '#4338ca' }, // indigo-700
  activeTabText: { color: '#ffffff' }, // white
  inactiveTabText: { color: '#d1d5db' }, // gray-300
  switchTrackColor: '#4338ca', // indigo-700
  switchThumbColor: '#ffffff', // white
});

const specialTheme = StyleSheet.create({
  container: { backgroundColor: '#fce7f3' }, // pink-100
  cardBackground: { backgroundColor: '#fff1f2' }, // pink-50
  headingText: { color: '#9d174d' }, // pink-700
  bodyText: { color: '#831843' }, // pink-800
  secondaryText: { color: '#be185d' }, // pink-600
  placeholderText: { color: '#f472b6' }, // pink-500
  label: { color: '#831843' }, // pink-800
  input: { borderColor: '#fbcfe8', backgroundColor: '#fce7f3', color: '#831843' }, // pink-300, pink-100, pink-900
  primaryButton: { backgroundColor: '#db2777' }, // pink-600
  secondaryButton: { backgroundColor: '#f472b6' }, // pink-400
  cardPrimaryButton: { backgroundColor: '#ec4899' }, // pink-500
  cardSecondaryButton: { backgroundColor: '#f472b6' }, // pink-400
  cardDeleteButton: { backgroundColor: '#f43f5e' }, // pink-400
  newNoteButton: { backgroundColor: '#db2777' }, // pink-600
  settingsButton: { backgroundColor: '#db2777' }, // pink-600
  groupButton: { backgroundColor: '#db2777' }, // pink-600
  alarmText: { color: '#eab308' }, // yellow-600 (pembe tema için sarı alarm uygun)
  emptyListText: { color: '#be185d' }, // pink-600
  groupNotesBorder: { borderColor: '#fbcfe8' }, // pink-200
  multiSelectItemSelected: { backgroundColor: '#fbcfe8' }, // pink-300
  multiSelectItemText: { color: '#831843' }, // pink-800
  multiSelectItemBorder: { borderColor: '#fbcfe8' }, // pink-300
  tabBarBackground: { backgroundColor: '#fbcfe8' }, // pink-200
  tabBarBorder: { borderColor: '#fbcfe8' }, // pink-300
  activeTabButton: { backgroundColor: '#db2777' }, // pink-600
  activeTabText: { color: '#ffffff' }, // white
  inactiveTabText: { color: '#9d174d' }, // pink-700
  switchTrackColor: '#db2777', // pink-600
  switchThumbColor: '#ffffff', // white
});


const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  loadingText: {
    fontSize: 18,
    color: '#374151',
  },
  container: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    paddingBottom: 80, // Tab bar için boşluk
  },
  newNoteButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 16, // iOS için üst boşluk
    left: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  settingsButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 16, // iOS için üst boşluk
    right: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  greetingText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: Platform.OS === 'ios' ? 80 : 60, // Butonların altından başla
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  noteFormContainer: {
    width: '100%',
    maxWidth: 600, // Web'deki max-w-2xl'e benzer
    padding: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
    marginBottom: 32,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    width: '100%',
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  button: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginTop: 4, // Tailwind'deki mt-2'ye benzer
  },
  cancelButton: {
    marginTop: 8,
  },
  mainContentArea: {
    width: '100%',
    maxWidth: 600, // Web'deki max-w-2xl'e benzer
  },
  searchContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  listScrollView: {
    width: '100%',
    maxHeight: 400, // Web'deki max-h-[60vh]'ye benzer
    paddingBottom: 16, // Alt sekme çubuğu ile çakışmaması için
  },
  emptyListText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 32,
  },
  noteCard: {
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 16,
  },
  noteTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  noteContent: {
    fontSize: 16,
    marginBottom: 12,
  },
  noteAlarm: {
    fontSize: 14,
    marginBottom: 8,
  },
  noteGroups: {
    fontSize: 12,
    marginBottom: 8,
  },
  noteTimestamp: {
    fontSize: 14,
    marginBottom: 12,
  },
  cardButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  cardButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    marginLeft: 8,
  },
  cardDeleteButton: {
    // Renk tema tarafından belirlenir
  },
  groupCard: {
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 16,
  },
  groupName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  groupNotesListContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  groupNotesListTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  groupNoteItem: {
    fontSize: 14,
    marginLeft: 8,
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContent: {
    padding: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  nameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  flexGrow: {
    flexGrow: 1,
    marginRight: 8,
  },
  saveNameButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  themeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  themeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  multiSelectContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    maxHeight: 150,
  },
  multiSelectItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee', // Hafif bir çizgi
  },
  modalNotesList: {
    maxHeight: 250, // Gruba not ekleme modalındaki liste için
  },
  bottomTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  tabButtonText: {
    fontWeight: 'bold',
  },
});

export default App;

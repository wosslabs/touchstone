use std::sync::Mutex;

#[derive(Debug, PartialEq, Eq)]
pub struct BlankTitle;

#[derive(Default)]
pub struct List {
    titles: Mutex<Vec<String>>,
}

impl List {
    pub fn add(&self, title: &str) -> Result<(), BlankTitle> {
        if title.trim().is_empty() {
            return Err(BlankTitle);
        }
        self.titles.lock().unwrap().push(title.to_string());
        Ok(())
    }

    pub fn titles(&self) -> Vec<String> {
        self.titles.lock().unwrap().clone()
    }
}

// Unit tests stay next to the code. Acceptance scenarios live in features/.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_tasks_in_order() {
        let list = List::default();
        list.add("Buy milk").unwrap();
        list.add("Walk the dog").unwrap();
        assert_eq!(list.titles(), vec!["Buy milk", "Walk the dog"]);
    }

    #[test]
    fn rejects_a_blank_title() {
        assert_eq!(List::default().add("  "), Err(BlankTitle));
    }
}
